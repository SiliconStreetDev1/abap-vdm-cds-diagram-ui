/**
 * @fileoverview DOM Manipulation and lifecycle synchronization for SAP UI5.
 */
import HTML from "sap/ui/core/HTML";
import { CONFIG } from "./DiagramConfig";
import NetworkManager from "./NetworkManager";

declare const d3: any;

export default class DomManager {
    
    /**
     * @public
     * @description Polls the browser DOM until the UI5 framework physically paints the 
     * target container. UI5's visible=true property is asynchronous; this prevents D3
     * from attempting to mount to a null reference.
     * @param {HTML} oHtml - The SAP UI5 HTML control serving as the wrapper.
     * @param {(msg: string) => void} fnOnError - Executed if the DOM fails to mount before MAX_ATTEMPTS.
     * @param {(sRenderId: string) => void} fnCallback - Executed with a unique epoch ID upon success.
     */
    public static setupCanvas(oHtml: HTML, fnOnError: (msg: string) => void, fnCallback: (sRenderId: string) => void): void {
        const sParentId = "vdmCanvasContainer";

        if (!oHtml.getContent()) {
            oHtml.setContent(`<div id="${sParentId}" style="width:100%; height:100%; overflow:hidden; display:flex; justify-content:center; align-items:center;"></div>`);
        }

        let iAttempts = 0;
        const timer = setInterval(() => {
            const oParentDiv = document.getElementById(sParentId);
            iAttempts++;

            if (oParentDiv) {
                clearInterval(timer);
                oParentDiv.innerHTML = "";
                
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
     * @public
     * @description Binds standard D3 mouse-wheel zoom and click-and-drag panning to a target SVG.
     * Applies responsive ViewBox logic to prevent squashing and stripping of physical dimension constraints.
     * @param {string} sRenderId - The DOM ID containing the injected SVG.
     */
    public static attachStandardZoom(sRenderId: string): void {
        NetworkManager.loadScript(CONFIG.CDN.D3).then(() => {
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
}