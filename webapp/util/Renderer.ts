/**
 * @fileoverview VDM / CDS Diagram Engine Renderer
 * @author Silicon Street Limited
 * * DESIGN RATIONALE:
 * Isolating the rendering logic ensures the UI5 Controller only handles framework events.
 * This class assumes responsibility for raw DOM manipulation, D3 zooming behaviors, 
 * asynchronous third-party script injections, and canvas export workarounds.
 * * OPEN-SOURCE COMPONENTS: 
 * Mermaid.js (MIT), D3.js (ISC), d3-graphviz (BSD-3), @hpcc-js/wasm (Apache-2.0), Pako (MIT).
 */
import HTML from "sap/ui/core/HTML";

// Ambient declarations for external libraries injected dynamically via CDN
declare const mermaid: any;
declare const d3: any;
declare const pako: any;

const CONFIG = {
    URL_PLANTUML_SERVER: "https://www.plantuml.com/plantuml/svg/",
    MAX_URL_LENGTH: 7000, // Circuit breaker to prevent HTTP 414 URL Too Long errors
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
    
    // Caches Promises to prevent redundant network requests on rapid re-renders
    private static _scriptPromises: Record<string, Promise<void> | undefined> = {};
    private static _bMermaidInit: boolean = false;

    /**
     * Primary entry point for rendering. Routes the VDM payload to the correct visual engine.
     * * @public
     * @param {string} sEngine - The selected rendering engine ("MERMAID", "GRAPHVIZ", "PLANTUML").
     * @param {string} sPayload - The raw syntax string representing the diagram.
     * @param {HTML} oHtmlControl - The SAP UI5 HTML core control acting as the wrapper/container.
     * @param {(msg: string) => void} fnOnError - Callback function to execute if rendering fails, passing the error message to the UI.
     * @returns {void}
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
                default:
                    fnOnError(`Unsupported rendering engine: ${sEngine}`);
            }
        });
    }

    /**
     * Prepares the UI5 HTML Control's DOM representation by polling until it exists.
     * WORKAROUND: UI5 'visible' toggles do not instantly flush to the DOM.
     * * @private
     * @param {HTML} oHtml - The UI5 HTML control to inject the canvas container into.
     * @param {(msg: string) => void} fnOnError - Callback function triggered if the DOM container fails to mount within the timeout limit.
     * @param {(sRenderId: string) => void} fnCallback - Callback function executed upon successful DOM mounting, providing the unique render ID.
     * @returns {void}
     */
    private static _setupCanvas(oHtml: HTML, fnOnError: (msg: string) => void, fnCallback: (sRenderId: string) => void): void {
        const sParentId = "vdmCanvasContainer";

        // Inject the stable parent container. Inherits 100% constraints from parent layout (e.g., Splitter).
        if (!oHtml.getContent()) {
            oHtml.setContent(`<div id="${sParentId}" style="width:100%; height:100%; overflow:hidden; display:flex; justify-content:center; align-items:center;"></div>`);
        }

        let iAttempts = 0;
        const timer = setInterval(() => {
            const oParentDiv = document.getElementById(sParentId);
            iAttempts++;

            if (oParentDiv) {
                clearInterval(timer);
                
                // MEMORY LEAK PREVENTION: Hard-wipe container to destroy orphaned WASM/Canvas instances
                oParentDiv.innerHTML = "";
                
                // Bypass aggressive browser DOM caching with a unique epoch ID
                const sRenderId = "render-" + Date.now();
                oParentDiv.innerHTML = `<div id="${sRenderId}" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center;"></div>`;
                
                fnCallback(sRenderId);
            } else if (iAttempts >= CONFIG.DOM_POLL_MAX_ATTEMPTS) {
                clearInterval(timer);
                fnOnError("Renderer Timeout: UI5 failed to paint the DOM container.");
            }
        }, CONFIG.DOM_POLL_INTERVAL_MS);
    }

    /**
     * Renders a Mermaid.js diagram payload into the target DOM container.
     * SECURITY NOTE: Enforces `htmlLabels: false` to prevent <foreignObject> injections
     * which cause "Tainted Canvas" security errors during PNG export.
     * * @private
     * @param {string} sPayload - The raw Mermaid syntax string.
     * @param {string} sRenderId - The unique DOM ID of the target rendering container.
     * @param {(msg: string) => void} fnOnError - Callback function for Mermaid parsing or network errors.
     * @returns {void}
     */
    private static _renderMermaid(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        this._loadScript(CONFIG.CDN.MERMAID).then(() => {
            try {
                if (!this._bMermaidInit) {
                    mermaid.mermaidAPI.initialize({ 
                        startOnLoad: false, 
                        theme: 'default',
                        securityLevel: 'loose',
                        htmlLabels: false, // CRITICAL: Forces pure SVG nodes for export safety
                        maxTextSize: 500000, // Scales limits for large CDS structures
                        maxEdges: 10000, 
                        flowchart: {
                            useMaxWidth: false,
                            htmlLabels: false
                        }
                    });
                    this._bMermaidInit = true;
                }

                const sSvgId = "mermaid-svg-" + Date.now();
                const oTarget = document.getElementById(sRenderId);
                
                if (oTarget) {
                    oTarget.innerHTML = ""; // Clear lingering error text from past renders
                    
                    mermaid.mermaidAPI.render(sSvgId, sPayload, (svgCode: string) => {
                        oTarget.innerHTML = svgCode;
                        this._attachSvgZoom(sRenderId);
                    });
                }
            } catch (e: any) {
                fnOnError(`Mermaid Syntax Error: ${e.str || e.message || e}`);
            }
        }).catch((oNetworkError: any) => {
            fnOnError(`Mermaid CDN Error: ${oNetworkError.message || oNetworkError}`);
        });
    }

    /**
     * Renders a Graphviz (.dot) payload using the WASM engine.
     * FIX: Overrides Graphviz's hardcoded physical dimensions post-render to ensure 
     * smooth responsive zooming.
     * * @private
     * @param {string} sPayload - The raw Graphviz DOT syntax string.
     * @param {string} sRenderId - The unique DOM ID of the target rendering container.
     * @param {(msg: string) => void} fnOnError - Callback function for Graphviz engine or initialization errors.
     * @returns {Promise<void>} Resolves when the async rendering cycle is complete.
     */
    private static async _renderGraphviz(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): Promise<void> {
        try {
            await this._loadScript(CONFIG.CDN.D3);
            await this._loadScript(CONFIG.CDN.GRAPHVIZ_WASM);
            await this._loadScript(CONFIG.CDN.GRAPHVIZ_PLUGIN);

            if (typeof d3.select("body").graphviz !== "function") {
                throw new Error("d3-graphviz plugin failed to bind to global D3 object.");
            }

            d3.select(`#${sRenderId}`)
                .graphviz()
                .tweenPaths(false)  // Disabled to prevent browser lockup on complex graphs
                .tweenShapes(false)
                .zoom(true)
                .zoomScaleExtent([0.001, 100])
                .fit(true)
                .on("renderEnd", () => {
                    const svg = d3.select(`#${sRenderId} svg`);
                    if (!svg.empty()) {
                        svg.attr("width", "100%")
                           .attr("height", "100%")
                           .style("width", "100%")
                           .style("height", "100%")
                           .attr("preserveAspectRatio", "xMidYMid meet");
                    }
                })
                .renderDot(sPayload);

        } catch (e: any) {
            fnOnError(`Graphviz Engine Error: ${e.message}`);
        }
    }

    /**
     * Renders a diagram via the public PlantUML generation server.
     * * @private
     * @param {string} sPayload - The raw PlantUML syntax string.
     * @param {string} sRenderId - The unique DOM ID of the target rendering container.
     * @param {(msg: string) => void} fnOnError - Callback function for payload limits or network errors.
     * @returns {void}
     */
    private static _renderPlantUML(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        this._loadScript(CONFIG.CDN.PAKO).then(() => {
            try {
                const utf8Bytes = new TextEncoder().encode(sPayload);
                const deflated = pako.deflateRaw(utf8Bytes, { level: 9 });
                const encoded = this._encode64(deflated);

                if (encoded.length > CONFIG.MAX_URL_LENGTH) {
                    fnOnError("Payload exceeds PlantUML public server limits. Please switch to Mermaid or Graphviz.");
                    return;
                }

                fetch(`${CONFIG.URL_PLANTUML_SERVER}${encoded}`)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.text();
                    })
                    .then(svgText => this._processPlantUmlSvg(svgText, sRenderId))
                    .catch(err => fnOnError(`PlantUML Network Error: ${err.message}`));

            } catch (e: any) {
                fnOnError(`PlantUML Encoding Error: ${e.message}`);
            }
        });
    }

    /**
     * Cleans XML comments from the PlantUML SVG response before DOM injection.
     * FIX: Strict XML parsers crash if the Base64 source code embedded in the comment contains '--'.
     * * @private
     * @param {string} svgText - The raw SVG text returned from the PlantUML server.
     * @param {string} sRenderId - The unique DOM ID of the target rendering container.
     * @returns {void}
     */
    private static _processPlantUmlSvg(svgText: string, sRenderId: string): void {
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
     * Binds standard D3 pan and zoom behaviors to non-Graphviz SVG outputs.
     * * @private
     * @param {string} sRenderId - The unique DOM ID of the container holding the rendered SVG.
     * @returns {void}
     */
    private static _attachSvgZoom(sRenderId: string): void {
        this._loadScript(CONFIG.CDN.D3).then(() => {
            setTimeout(() => {
                const svg = d3.select(`#${sRenderId} svg`);
                if (svg.empty()) return;

                svg.style("width", null).style("height", null);
                svg.style("max-width", "none").style("max-height", "none");

                const sWidth = svg.attr("width");
                const sHeight = svg.attr("height");
                
                if (!svg.attr("viewBox") && sWidth && sHeight && !sWidth.includes("%")) {
                    const w = parseFloat(sWidth.replace(/px|pt|em/g, ""));
                    const h = parseFloat(sHeight.replace(/px|pt|em/g, ""));
                    if (!isNaN(w) && !isNaN(h)) {
                        svg.attr("viewBox", `0 0 ${w} ${h}`);
                    }
                }

                svg.attr("width", "100%").attr("height", "100%");
                svg.attr("preserveAspectRatio", "xMidYMid meet");

                const zoom = d3.zoom()
                    .scaleExtent([0.05, 50])
                    .on("zoom", (event: any) => {
                        svg.select("g").attr("transform", event.transform);
                    });

                svg.call(zoom);

                svg.on("dblclick.zoom", () => {
                    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
                });
            }, 100);
        });
    }

    /**
     * Safely serializes an SVG element to a PNG Blob.
     * Includes a dynamic Canvas Governor to step down resolution if the image exceeds browser memory limits.
     * * @public
     * @param {SVGSVGElement} oSvg - The raw SVG DOM element to be converted.
     * @returns {Promise<Blob>} A promise that resolves with the generated PNG Blob, or rejects on failure/memory constraints.
     */
    public static convertSvgToPng(oSvg: SVGSVGElement): Promise<Blob> {
        return new Promise((resolve, reject) => {
            let sSvgData = new XMLSerializer().serializeToString(oSvg);
            
            sSvgData = sSvgData.replace(/@import url\([^)]+\);?/gi, ""); 
            sSvgData = sSvgData.replace(/<image[^>]+href="http[^>]+>/gi, ""); 

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Failed to acquire Canvas 2D context."));

            const img = new Image();
            const width = parseFloat(oSvg.getAttribute("width") || "3000");
            const height = parseFloat(oSvg.getAttribute("height") || "3000");
            
            let scale = 2; 
            const MAX_DIMENSION = 16000; 
            const MAX_AREA = 100000000; 
            
            while ((width * scale > MAX_DIMENSION || height * scale > MAX_DIMENSION || (width * scale * height * scale) > MAX_AREA) && scale > 0.5) {
                scale -= 0.5; 
            }

            canvas.width = width * scale;
            canvas.height = height * scale;
            ctx.scale(scale, scale);

            const sBase64 = btoa(unescape(encodeURIComponent(sSvgData)));
            img.src = "data:image/svg+xml;base64," + sBase64;

            img.onload = () => {
                ctx.fillStyle = "white"; 
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0);
                
                try {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error("Image too massive for pixel rendering. Use SVG Download instead."));
                    }, "image/png");
                } catch (e: any) {
                    reject(new Error(`Canvas Export Error: ${e.message}`));
                }
            };

            img.onerror = () => reject(new Error("Failed to parse sanitized SVG Data URI."));
        });
    }

    /**
     * Prepares an SVG for raw download by inlining computed styles and securing the coordinate system.
     * * @public
     * @param {SVGSVGElement} oClone - The detached clone of the SVG element destined for download.
     * @param {SVGSVGElement} oOriginalSvg - The original, live SVG element currently in the DOM to read styles from.
     * @returns {void}
     */
    public static hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
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

        const oContentGroup = oOriginalSvg.querySelector("g");
        if (oContentGroup) {
            try {
                const oBBox = (oContentGroup as SVGGElement).getBBox();
                const iPad = 20;
                oClone.setAttribute("viewBox", `${oBBox.x - iPad} ${oBBox.y - iPad} ${oBBox.width + (iPad * 2)} ${oBBox.height + (iPad * 2)}`);
                oClone.setAttribute("width", `${oBBox.width + (iPad * 2)}px`);
                oClone.setAttribute("height", `${oBBox.height + (iPad * 2)}px`);
            } catch (e) {
                oClone.setAttribute("width", oOriginalSvg.getAttribute("width") || "100%");
                oClone.setAttribute("height", oOriginalSvg.getAttribute("height") || "100%");
            }
        }

        const oCloneRootGroup = oClone.querySelector("g");
        if (oCloneRootGroup) oCloneRootGroup.removeAttribute("transform");
    }

    // =========================================================== 
    // CORE NETWORK & ENCODING UTILITIES                           
    // =========================================================== 

    /**
     * Dynamically loads a JavaScript library via a `<script>` tag from a CDN.
     * * @private
     * @param {string} src - The URL of the script to load.
     * @returns {Promise<void>} Resolves when the script finishes loading.
     */
    private static _loadScript(src: string): Promise<void> {
        if (this._scriptPromises[src]) return this._scriptPromises[src]!;
        const newPromise = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => { delete this._scriptPromises[src]; reject(new Error(`Failed to load CDN: ${src}`)); };
            document.head.appendChild(script);
        });
        this._scriptPromises[src] = newPromise;
        return newPromise;
    }

    /**
     * Maps standard Base64 to PlantUML's proprietary custom 6-bit URL-safe alphabet.
     * * @private
     * @param {Uint8Array} data - The deflated byte array of the PlantUML payload.
     * @returns {string} The proprietary PlantUML encoded string.
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

    /**
     * Helper method for PlantUML encoding: converts 3 bytes into 4 characters.
     * * @private
     * @param {number} b1 - First byte.
     * @param {number} b2 - Second byte.
     * @param {number} b3 - Third byte.
     * @returns {string} A 4-character string from the PlantUML alphabet.
     */
    private static _enc3(b1: number, b2: number, b3: number): string {
        const c1 = b1 >> 2;
        const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
        const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
        const c4 = b3 & 0x3F;
        return this._enc1(c1 & 0x3F) + this._enc1(c2 & 0x3F) + this._enc1(c3 & 0x3F) + this._enc1(c4 & 0x3F);
    }

    /**
     * Helper method for PlantUML encoding: maps a 6-bit integer to the PlantUML alphabet.
     * * @private
     * @param {number} b - A 6-bit integer.
     * @returns {string} A single character from the PlantUML alphabet.
     */
    private static _enc1(b: number): string {
        if (b < 10) return String.fromCharCode(48 + b); b -= 10;
        if (b < 26) return String.fromCharCode(65 + b); b -= 26;
        if (b < 26) return String.fromCharCode(97 + b); b -= 26;
        if (b === 0) return '-'; if (b === 1) return '_'; return '?';
    }
}