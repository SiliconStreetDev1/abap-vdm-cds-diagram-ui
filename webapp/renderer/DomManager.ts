/**
 * @fileoverview DOM Manipulation and lifecycle synchronization for SAP UI5.
 */

import HTML from "sap/ui/core/HTML";
import ConfigManager from "./ConfigManager";
import NetworkManager from "../helpers/NetworkManager";

declare const d3: any;

export default class DomManager {
    
    private static _bIsMountPending: boolean = false;

    /**
     * @public
     * @description Polls the browser DOM until the UI5 framework physically paints the container.
     * @param {HTML} oHtml - The SAP UI5 HTML control.
     * @param {(msg: string) => void} onError - Executed if DOM fails to mount.
     * @param {(sRenderId: string) => void} fnCallback - Executed with a unique epoch ID upon success.
     */
    public static setupCanvas(oHtml: HTML, onError: (msg: string) => void, fnCallback: (sRenderId: string) => void): void {
        
        const sParentId = oHtml.getId() + "-vdmCanvasContainer";
        const config = ConfigManager.get();

        const bNeedsContent = !oHtml.getContent();
        if (bNeedsContent) {
            oHtml.setContent(`<div id="${sParentId}" style="width:100%; height:100%; overflow:hidden; position:relative;"></div>`);
        }

        const executeMount = () => {
            this._bIsMountPending = false;
            const oParentDiv = document.getElementById(sParentId);
            if (oParentDiv) {
                // ENTERPRISE MEMORY FIX: Explicitly release WebGL and GPU contexts 
                // before wiping the DOM to prevent hitting the browser's 16-context limit.
                const aCanvases = oParentDiv.getElementsByTagName("canvas");
                for (let i = 0; i < aCanvases.length; i++) {
                    const oCanvas = aCanvases[i];
                    
                    const gl = oCanvas.getContext("webgl") || oCanvas.getContext("experimental-webgl");
                    if (gl) {
                        const ext = (gl as any).getExtension("WEBGL_lose_context");
                        if (ext) ext.loseContext();
                    }
                    // Zero out dimensions to instantly free GPU backing store
                    oCanvas.width = 0;
                    oCanvas.height = 0;
                }

                oParentDiv.innerHTML = "";
                
                // Random alphanumeric salt prevents WebGL ID collisions during rapid re-renders
                const sRenderId = "render-" + Math.random().toString(36).substring(2, 9) + "-" + Date.now();
                oParentDiv.innerHTML = `<div id="${sRenderId}" style="width:100%; height:100%; position:relative; overflow:hidden;"></div>`;
                
                // Ensure DOM has physically updated before Cytoscape attempts to attach WebGL
                requestAnimationFrame(() => fnCallback(sRenderId));
            } else {
                onError("Renderer Error: Target DOM container not found.");
            }
        };

        if (!bNeedsContent && document.getElementById(sParentId)) {
            executeMount();
        } else if (!this._bIsMountPending) {
            this._bIsMountPending = true;
            const oDelegate = {
                onAfterRendering: () => {
                    oHtml.removeEventDelegate(oDelegate);
                    requestAnimationFrame(executeMount);
                }
            };
            oHtml.addEventDelegate(oDelegate);
        }
    }

    /**
     * @public
     * @description Binds standard D3 mouse-wheel zoom and click-and-drag panning to a target SVG.
     * @param {string} sRenderId - The DOM ID containing the injected SVG.
     */
    public static attachStandardZoom(sRenderId: string): void {
        const config = ConfigManager.get();
        
        NetworkManager.loadScript(config.localPaths?.d3, config.cdnPaths?.d3).then(() => {
            // Use the browser's paint lifecycle instead of an arbitrary 100ms timeout
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
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
                });
            });
        });
    }
}