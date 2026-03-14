/**
 * @fileoverview VDM Diagram Engine Renderer
 * @version 1.4
 * @author Silicon Street Limited
 * DESIGN RATIONALE: Isolates rendering math and DOM manipulation from UI5.
 * Handles engine-specific quirks (like Graphviz negative coordinates).
 */
import HTML from "sap/ui/core/HTML";

// External library declarations for dynamic loading
declare const mermaid: any;
declare const d3: any;
declare const pako: any;

const CONFIG = {
    URL_PLANTUML_SERVER: "https://www.plantuml.com/plantuml/svg/",
    MAX_URL_LENGTH: 7000,
    DOM_POLL_INTERVAL_MS: 50,
    DOM_POLL_MAX_ATTEMPTS: 20,
    CDN: {
        MERMAID: "https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js",
        D3: "https://d3js.org/d3.v7.min.js",
        GRAPHVIZ_WASM: "https://unpkg.com/@hpcc-js/wasm@2.14.1/dist/graphviz.umd.js",
        GRAPHVIZ_PLUGIN: "https://unpkg.com/d3-graphviz@5.1.0/build/d3-graphviz.min.js",
        PAKO: "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"
    }
};

export default class Renderer {
    private static _scriptPromises: Record<string, Promise<void> | undefined> = {};

    /**
     * Entry point: Prepares the canvas and routes to the specific engine renderer.
     * @param {string} sEngine - Active rendering engine.
     * @param {string} sPayload - The code to visualize.
     * @param {HTML} oHtmlControl - The UI5 HTML control to hold the SVG.
     * @param {Function} fnOnError - Callback for runtime errors.
     * @public
     */
    public static renderDiagram(sEngine: string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void): void {
        this._setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            switch (sEngine) {
                case "MERMAID": this._renderMermaid(sPayload, sRenderId, fnOnError); break;
                case "GRAPHVIZ": this._renderGraphviz(sPayload, sRenderId, fnOnError); break;
                case "PLANTUML": this._renderPlantUML(sPayload, sRenderId, fnOnError); break;
            }
        });
    }

    /**
     * Polls the DOM until UI5 has actually rendered the <div>, then wipes it for a fresh diagram.
     * @private
     */
    private static _setupCanvas(oHtml: HTML, fnOnError: (msg: string) => void, fnCallback: (sRenderId: string) => void): void {
        const sParentId = "vdmCanvasContainer";
        // Inject stable parent div if it doesn't exist
        if (!oHtml.getContent()) {
            oHtml.setContent(`<div id="${sParentId}" style="width:100%; height:100%; overflow:hidden; display:flex; justify-content:center; align-items:center;"></div>`);
        }
        
        let iAttempts = 0;
        const timer = setInterval(() => {
            const oParentDiv = document.getElementById(sParentId);
            if (oParentDiv) {
                clearInterval(timer);
                oParentDiv.innerHTML = ""; // Clear old canvas
                const sRenderId = "render-" + Date.now();
                // Create unique inner container for D3/Mermaid
                oParentDiv.innerHTML = `<div id="${sRenderId}" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center;"></div>`;
                fnCallback(sRenderId);
            } else if (++iAttempts >= CONFIG.DOM_POLL_MAX_ATTEMPTS) {
                clearInterval(timer);
                fnOnError("UI5 DOM container timed out.");
            }
        }, CONFIG.DOM_POLL_INTERVAL_MS);
    }

    /**
     * Loads D3/Graphviz/WASM and renders the DOT notation.
     * @private
     */
    private static _renderGraphviz(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        Promise.all([this._loadScript(CONFIG.CDN.D3), this._loadScript(CONFIG.CDN.GRAPHVIZ_WASM), this._loadScript(CONFIG.CDN.GRAPHVIZ_PLUGIN)]).then(() => {
            if (typeof d3.select(`#${sRenderId}`).graphviz !== "function") throw new Error("Graphviz Plugin failed to load.");
            // Render without animations to prevent UI lag on massive VDM graphs
            d3.select(`#${sRenderId}`).graphviz().tweenPaths(false).tweenShapes(false).zoom(true).fit(true).renderDot(sPayload);
        }).catch(e => fnOnError(`Graphviz Error: ${e.message}`));
    }

    /**
     * Prepares an SVG for export. Bakes styles and fixes the camera (viewBox).
     * FIX: Measures the inner <g> to handle Graphviz's negative Y space (e.g. y="-2091").
     * @param {SVGSVGElement} oClone - The copy being exported.
     * @param {SVGSVGElement} oOriginalSvg - The live SVG on screen used for measurement.
     * @public
     */
    public static hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
        // Enforce XML namespaces for desktop compatibility
        if (!oClone.getAttribute("xmlns")) oClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        if (!oClone.getAttribute("xmlns:xlink")) oClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

        // 1. STYLE INLINING: Map computed CSS from original to clone (makes colors portable)
        const aOriginal = oOriginalSvg.querySelectorAll("path, polygon, ellipse, text, circle, rect");
        const aClone = oClone.querySelectorAll("path, polygon, ellipse, text, circle, rect");
        aOriginal.forEach((el, i) => {
            const style = window.getComputedStyle(el);
            const oCloneEl = aClone[i] as HTMLElement;
            if (oCloneEl?.style) {
                oCloneEl.style.fill = style.fill;
                oCloneEl.style.stroke = style.stroke;
                oCloneEl.style.strokeWidth = style.strokeWidth;
                oCloneEl.style.fontSize = style.fontSize;
                oCloneEl.style.fontFamily = style.fontFamily;
            }
        });

        // 2. COORDINATE REPAIR: Recalculate viewBox based on actual content position
        const oContentGroup = oOriginalSvg.querySelector("g");
        if (oContentGroup) {
            try {
                const oBBox = oContentGroup.getBBox(); // Measure actual drawn pixels
                const iPad = 20; // 20px padding margin
                // Frame the camera exactly where the pixels are (even if negative Y)
                oClone.setAttribute("viewBox", `${oBBox.x - iPad} ${oBBox.y - iPad} ${oBBox.width + (iPad * 2)} ${oBBox.height + (iPad * 2)}`);
                oClone.setAttribute("width", (oBBox.width + (iPad * 2)) + "px");
                oClone.setAttribute("height", (oBBox.height + (iPad * 2)) + "px");
            } catch (e) {
                oClone.setAttribute("width", "3000px");
                oClone.setAttribute("height", "3000px");
            }
        }

        // 3. WIPE ZOOM: Ensure download starts at 1:1 scale, not user's current zoom level
        const oRootG = oClone.querySelector("g");
        if (oRootG) oRootG.removeAttribute("transform");
    }

    /**
     * Converts the hardened SVG into a crisp PNG Blob using HTML5 Canvas.
     * @param {SVGSVGElement} oSvg - Hardened SVG element.
     * @returns {Promise<Blob>}
     * @public
     */
    public static convertSvgToPng(oSvg: SVGSVGElement): Promise<Blob> {
        return new Promise((resolve, reject) => {
            let sSvgData = new XMLSerializer().serializeToString(oSvg);
            // Localize clip-paths that D3 creates with absolute URLs
            sSvgData = sSvgData.replace(/url\(['"]?https?:\/\/[^#]+#/g, "url(#");

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();
            const width = parseFloat(oSvg.getAttribute("width") || "3000");
            const height = parseFloat(oSvg.getAttribute("height") || "3000");
            
            // Resolution Control: Default to 2.0x (Retina) for sharp text
            let scale = 2.0; 
            const MAX_PX = 60000000; // ~60MP safety limit
            if ((width * scale) * (height * scale) > MAX_PX) scale = Math.sqrt(MAX_PX / (width * height));
            
            canvas.width = width * scale;
            canvas.height = height * scale;

            // Load SVG data into image object
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(sSvgData)));
            img.onload = () => {
                if (ctx) {
                    ctx.fillStyle = "white"; // PNG background fill
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                }
                canvas.toBlob(b => b ? resolve(b) : reject(new Error("Memory Limit")), "image/png", 1.0);
            };
            img.onerror = () => reject(new Error("Parse Error"));
        });
    }

    /**
     * Ensures scripts are only injected into the head once per session.
     * @private
     */
    private static _loadScript(src: string): Promise<void> {
        if (this._scriptPromises[src]) return this._scriptPromises[src]!;
        this._scriptPromises[src] = new Promise((res, rej) => {
            const s = document.createElement('script'); s.src = src;
            s.onload = () => res(); s.onerror = () => rej();
            document.head.appendChild(s);
        });
        return this._scriptPromises[src]!;
    }
}