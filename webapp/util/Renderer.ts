/**
 * @fileoverview VDM Diagram Engine Renderer
 * @author Silicon Street Limited
 * * DESIGN RATIONALE:
 * Isolating the rendering logic ensures the Main.controller only handles UI5 framework events.
 * This class handles all raw DOM manipulation, D3 zooming, and third-party script injections.
 * * * Includes open-source components: Mermaid.js (MIT), D3.js (ISC), 
 * d3-graphviz (BSD-3), @hpcc-js/wasm (Apache-2.0), Pako (MIT).
 */
import HTML from "sap/ui/core/HTML";

// Ambient declarations for external libraries injected dynamically via CDN
declare const mermaid: any;
declare const d3: any;
declare const pako: any;

const CONFIG = {
    URL_PLANTUML_SERVER: "https://www.plantuml.com/plantuml/svg/",
    MAX_URL_LENGTH: 7000, // Hard limit to prevent HTTP 414 URL Too Long errors from the PlantUML public server
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
    
    // Caches Promises so if a user clicks Generate 5 times, the CDN script is only requested once.
    private static _scriptPromises: Record<string, Promise<void> | undefined> = {};
    private static _bMermaidInit: boolean = false;

    /**
     * Primary entry point for rendering. Routes the string payload to the correct visual engine.
     */
    public static renderDiagram(sEngine: string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void): void {
        this._setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            switch (sEngine) {
                case "MERMAID":
                    this._renderMermaid(sPayload, sRenderId, fnOnError);
                    break;
                case "GRAPHVIZ":
                    this._renderGraphviz(sPayload, sRenderId, fnOnError);
                    break;
                case "PLANTUML":
                    this._renderPlantUML(sPayload, sRenderId, fnOnError);
                    break;
            }
        });
    }

    /**
     * UI5 DOM QUIRK WORKAROUND:
     * When UI5 sets `visible="true"` on an HTML control, the actual `<div>` isn't immediately painted to the browser DOM.
     * We must poll the DOM via `setInterval` until it exists before we can attach D3/Mermaid to it.
     */
    private static _setupCanvas(oHtml: HTML, fnOnError: (msg: string) => void, fnCallback: (sRenderId: string) => void): void {
        const sParentId = "vdmCanvasContainer";

        // Inject the stable parent container only once. This inherits 100% height from the Splitter.
        if (!oHtml.getContent()) {
            oHtml.setContent(`<div id="${sParentId}" style="width:100%; height:100%; overflow:hidden; display:flex; justify-content:center; align-items:center;"></div>`);
        }

        let iAttempts = 0;
        const timer = setInterval(() => {
            const oParentDiv = document.getElementById(sParentId);
            iAttempts++;

            if (oParentDiv) {
                clearInterval(timer);
                // MEMORY LEAK PREVENTION: Hard-wipe the container to destroy old WASM canvas instances or stray SVGs.
                oParentDiv.innerHTML = "";
                
                // Create a unique ID for this specific render to bypass aggressive browser/engine caching.
                const sRenderId = "render-" + Date.now();
                oParentDiv.innerHTML = `<div id="${sRenderId}" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center;"></div>`;
                
                fnCallback(sRenderId);
            } else if (iAttempts >= CONFIG.DOM_POLL_MAX_ATTEMPTS) {
                clearInterval(timer);
                fnOnError("Failed to render: UI5 DOM container timed out.");
            }
        }, CONFIG.DOM_POLL_INTERVAL_MS);
    }

/**
     * Renders a Mermaid.js diagram payload into the specified UI5 HTML control container.
     * FIX: Disables HTML labels to prevent "Tainted Canvas" security errors during PNG export.
     * * @param {string} sPayload - The raw Mermaid syntax string.
     * @param {string} sRenderId - The DOM ID of the target rendering container.
     * @param {(msg: string) => void} fnOnError - Callback function to trigger UI5 message strips on failure.
     */
    private static _renderMermaid(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        this._loadScript(CONFIG.CDN.MERMAID).then(() => {
            try {
                // Initialize Mermaid only once per session to avoid memory leaks
                if (!this._bMermaidInit) {
                    mermaid.mermaidAPI.initialize({ 
                        startOnLoad: false, 
                        theme: 'default',
                        
                        // SECURITY FIX: 'loose' allows specific styling, but 'htmlLabels: false' 
                        // is the critical fix. It forces Mermaid to use pure SVG <text> nodes 
                        // instead of embedding HTML <div> tags via <foreignObject>. 
                        // This stops the browser from aggressively blocking canvas exports (Tainted Canvas).
                        securityLevel: 'loose',
                        htmlLabels: false 
                    });
                    this._bMermaidInit = true;
                }

                // Generate a unique ID for the SVG to prevent DOM collisions on re-renders
                const sSvgId = "mermaid-svg-" + Date.now();
                
                // Render the diagram and inject the resulting SVG into our target container
                mermaid.mermaidAPI.render(sSvgId, sPayload, (svgCode: string) => {
                    const oTarget = document.getElementById(sRenderId);
                    if (oTarget) {
                        oTarget.innerHTML = svgCode;
                        
                        // Attach the D3 zoom and pan behaviors to the newly injected SVG
                        this._attachSvgZoom(sRenderId);
                    }
                });
            } catch (e: any) {
                fnOnError(`Mermaid Syntax Error: ${e.message || e}`);
            }
        });
    }

    private static async _renderGraphviz(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): Promise<void> {
        try {
            await this._loadScript(CONFIG.CDN.D3);
            await this._loadScript(CONFIG.CDN.GRAPHVIZ_WASM);
            await this._loadScript(CONFIG.CDN.GRAPHVIZ_PLUGIN);

            // Graphviz attaches itself to the d3 prototype. Validate it actually loaded.
            if (typeof d3.select("body").graphviz !== "function") {
                throw new Error("d3-graphviz failed to attach to d3");
            }

            d3.select(`#${sRenderId}`)
                .graphviz()
                .tweenPaths(false)  // Disable animations to prevent browser freezing on massive CDS graphs
                .tweenShapes(false)
                .zoom(true)
                .zoomScaleExtent([0.001, 100])
                .fit(true)
                .renderDot(sPayload);

        } catch (e: any) {
            fnOnError(`Graphviz Error: ${e.message}`);
        }
    }

    private static _renderPlantUML(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        this._loadScript(CONFIG.CDN.PAKO).then(() => {
            try {
                // Encode using DeflateRAW (no headers) to meet proprietary PlantUML server requirements
                const utf8Bytes = new TextEncoder().encode(sPayload);
                const deflated = pako.deflateRaw(utf8Bytes, { level: 9 });
                const encoded = this._encode64(deflated);

                if (encoded.length > CONFIG.MAX_URL_LENGTH) {
                    fnOnError(`Diagram is too massive for the public PlantUML server. Please use Mermaid or Graphviz, or download the PlantUML source code.`);
                    return;
                }

                // Fetch the SVG natively to allow D3 zooming and downloading
                fetch(`${CONFIG.URL_PLANTUML_SERVER}${encoded}`)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}: Server rejected request.`);
                        return response.text();
                    })
                    .then(svgText => this._processPlantUmlSvg(svgText, sRenderId))
                    .catch(err => fnOnError(`PlantUML Network Error: ${err.message}.`));

            } catch (e: any) {
                fnOnError(`PlantUML Encoding Error: ${e.message}`);
            }
        });
    }

    /**
     * Helper to clean and inject the PlantUML SVG response.
     */
    private static _processPlantUmlSvg(svgText: string, sRenderId: string): void {
        // XML PARSER FIX: PlantUML embeds the Base64 source code inside an XML comment in the SVG.
        // If that Base64 string happens to contain a double-hyphen '--', strict browser XML parsers crash.
        // We safely strip out all comments using a dynamic regex before injecting it into the DOM.
        const sCommentStart = "<" + "!--";
        const sCommentEnd = "--" + ">";
        const rxComments = new RegExp(sCommentStart + "[\\s\\S]*?" + sCommentEnd, "g");

        const cleanSvg = svgText.replace(rxComments, "");

        const oTarget = document.getElementById(sRenderId);
        if (oTarget) {
            oTarget.innerHTML = cleanSvg;
            this._attachSvgZoom(sRenderId);
        }
    }

    /**
     * Automatically binds D3 mouse-wheel zoom and click-and-drag panning to inline SVGs.
     */
  /**
     * Automatically binds D3 mouse-wheel zoom and click-and-drag panning to inline SVGs.
     * FIX: Prevents massive PlantUML/Mermaid SVGs from "squashing" by enforcing aspect ratios.
     */
    private static _attachSvgZoom(sRenderId: string): void {
        this._loadScript(CONFIG.CDN.D3).then(() => {
            setTimeout(() => {
                const svg = d3.select(`#${sRenderId} svg`);
                if (svg.empty()) return;

                // 1. Strip hardcoded physical styles which conflict with responsive UI5 containers
                svg.style("width", null).style("height", null);
                svg.style("max-width", "none").style("max-height", "none");

                // 2. If the SVG lacks a viewBox (PlantUML), derive one from the physical dimensions.
                const sWidth = svg.attr("width");
                const sHeight = svg.attr("height");
                
                // PARANOID CHECK: Only do this math if viewBox is missing AND width isn't a percentage
                if (!svg.attr("viewBox") && sWidth && sHeight && !sWidth.includes("%")) {
                    const w = parseFloat(sWidth.replace(/px|pt|em/g, ""));
                    const h = parseFloat(sHeight.replace(/px|pt|em/g, ""));
                    if (!isNaN(w) && !isNaN(h)) {
                        svg.attr("viewBox", `0 0 ${w} ${h}`);
                    }
                }

                // 3. Force 100% container fill, but strictly preserve the aspect ratio (prevents squashing)
                svg.attr("width", "100%").attr("height", "100%");
                svg.attr("preserveAspectRatio", "xMidYMid meet");

                // 4. Attach standard D3 Zoom logic
                const zoom = d3.zoom()
                    .scaleExtent([0.05, 50])
                    .on("zoom", (event: any) => {
                        svg.select("g").attr("transform", event.transform);
                    });

                svg.call(zoom);

                // UX refinement: Double-click resets the camera to the center
                svg.on("dblclick.zoom", () => {
                    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
                });
            }, 100);
        });
    }

  /**
     * Converts a raw SVG element into a high-resolution PNG Blob.
     * DESIGN RATIONALE: Uses a hidden HTML5 canvas to rasterize the vector data.
     * The canvas is scaled by 2x to ensure high-density (Retina/4K) visual quality.
     * * @param {SVGSVGElement} oSvg - The hardened SVG DOM node ready for export.
     * @returns {Promise<Blob>} A promise that resolves with the binary PNG Blob data.
     */
    public static convertSvgToPng(oSvg: SVGSVGElement): Promise<Blob> {
        return new Promise((resolve, reject) => {
            // 1. Serialize the SVG DOM node into a raw XML string
            let sSvgData = new XMLSerializer().serializeToString(oSvg);
            
            // SECURITY FIX A: Scrub External Resources
            // The Canvas API taints instantly if the SVG tries to load external fonts or images.
            // We use Regex to strip out any @import url(...) or external <image> tags from the raw string.
            sSvgData = sSvgData.replace(/@import url\([^)]+\);?/gi, ""); 
            sSvgData = sSvgData.replace(/<image[^>]+href="http[^>]+>/gi, ""); 

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();
            
            // 2. Dimensions and High-Res Scaling (2x)
            const width = parseFloat(oSvg.getAttribute("width") || "3000");
            const height = parseFloat(oSvg.getAttribute("height") || "3000");
            const scale = 2;
            
            canvas.width = width * scale;
            canvas.height = height * scale;
            if (ctx) ctx.scale(scale, scale);

            // SECURITY FIX B: Use Base64 Data URI instead of a Blob URL
            // Browsers trust inline Base64 data far more than Object URLs. 
            // We use encodeURIComponent + unescape to safely encode UTF-8 characters (like Japanese text or symbols) into Base64.
            const sBase64 = btoa(unescape(encodeURIComponent(sSvgData)));
            const url = "data:image/svg+xml;base64," + sBase64;

            img.onload = () => {
                if (ctx) {
                    ctx.fillStyle = "white"; // Prevent transparent black backgrounds
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0);
                }
                
                // Wrap toBlob in a try-catch to gracefully handle strict browser policies
                try {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Browser blocked canvas export (returned null)."));
                        }
                    }, "image/png");
                } catch (e: any) {
                    reject(new Error("SecurityError: Canvas is still tainted. " + e.message));
                }
            };

            img.onerror = () => {
                reject(new Error("Image object failed to parse the sanitized SVG Data URI."));
            };

            // Trigger the render
            img.src = url;
        });
    }

    /**
     * Prepares an SVG clone for external viewing by cleaning up internal D3 state and enforcing dimensions.
     * Prevents the "blank downloaded image" bug in Windows/Mac default image viewers.
     */
    public static hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
        // Enforce namespaces so desktop image viewers (Illustrator, Edge) don't reject the file
        if (!oClone.getAttribute("xmlns")) oClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        if (!oClone.getAttribute("xmlns:xlink")) oClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

        // Wipe D3 transforms. Ensures the downloaded image isn't offset with huge white borders.
        const oRootGroup = oClone.querySelector("g");
        if (oRootGroup) oRootGroup.removeAttribute("transform");

        // Enforce absolute pixels so the file doesn't collapse to 0x0
        if (oClone.hasAttribute("viewBox")) {
            const aViewBox = oClone.getAttribute("viewBox")!.split(/[\s,]+/);
            if (aViewBox.length >= 4) {
                oClone.setAttribute("width", `${aViewBox[2]}px`);
                oClone.setAttribute("height", `${aViewBox[3]}px`);
            }
        } else {
            const sWidth = oClone.getAttribute("width");
            if (!sWidth || sWidth.includes("%")) {
                try {
                    // Fallback: Dynamically measure the physical shapes to generate a bounding box
                    const oBBox = oOriginalSvg.getBBox();
                    if (oBBox && oBBox.width > 0) {
                        const pad = 20;
                        oClone.setAttribute("viewBox", `0 0 ${oBBox.width + (pad * 2)} ${oBBox.height + (pad * 2)}`);
                        oClone.setAttribute("width", `${oBBox.width + (pad * 2)}px`);
                        oClone.setAttribute("height", `${oBBox.height + (pad * 2)}px`);
                    }
                } catch (e) {
                    oClone.setAttribute("width", "3000px");
                    oClone.setAttribute("height", "3000px");
                }
            }
        }
    }

    // =========================================================== 
    // CORE NETWORK & ENCODING UTILITIES                           
    // =========================================================== 

    private static _loadScript(src: string): Promise<void> {
        if (this._scriptPromises[src]) return this._scriptPromises[src]!;
        const newPromise = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => { delete this._scriptPromises[src]; reject(new Error(`Failed: ${src}`)); };
            document.head.appendChild(script);
        });
        this._scriptPromises[src] = newPromise;
        return newPromise;
    }

    /**
     * Maps standard Base64 to PlantUML's proprietary custom 6-bit URL-safe alphabet.
     */
    private static _encode64(data: Uint8Array): string {
        let r = "";
        for (let i = 0; i < data.length; i += 3) {
            if (i + 2 === data.length) r += this._enc3(data[i], data[i + 1], 0);
            else if (i + 1 === data.length) r += this._enc3(data[i], 0, 0);
            else r += this._enc3(data[i], data[i + 1], data[i + 2]);
        }
        return r;
    }

    private static _enc3(b1: number, b2: number, b3: number): string {
        const c1 = b1 >> 2;
        const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
        const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
        const c4 = b3 & 0x3F;
        return this._enc1(c1 & 0x3F) + this._enc1(c2 & 0x3F) + this._enc1(c3 & 0x3F) + this._enc1(c4 & 0x3F);
    }

    private static _enc1(b: number): string {
        if (b < 10) return String.fromCharCode(48 + b); b -= 10;
        if (b < 26) return String.fromCharCode(65 + b); b -= 26;
        if (b < 26) return String.fromCharCode(97 + b); b -= 26;
        if (b === 0) return '-'; if (b === 1) return '_'; return '?';
    }
}