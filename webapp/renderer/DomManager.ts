/**
 * @fileoverview DOM Manipulation and lifecycle synchronization for SAP UI5.
 */

import HTML from "sap/ui/core/HTML";
import ConfigManager from "./ConfigManager";
import NetworkManager from "../helpers/NetworkManager";

declare const d3: any;

export default class DomManager {
    
    /**
     * @public
     * @description Polls the browser DOM until the UI5 framework physically paints the container.
     * @param {HTML} oHtml - The SAP UI5 HTML control.
     * @param {(msg: string) => void} fnOnError - Executed if DOM fails to mount.
     * @param {(sRenderId: string) => void} fnCallback - Executed with a unique epoch ID upon success.
     */
    public static setupCanvas(oHtml: HTML, fnOnError: (msg: string) => void, fnCallback: (sRenderId: string) => void): void {
        const sParentId = "vdmCanvasContainer";
        const config = ConfigManager.get();

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
            } else if (config.domPollMaxAttempts && iAttempts >= config.domPollMaxAttempts) {
                clearInterval(timer);
                fnOnError("Renderer Timeout: UI5 failed to paint the DOM container.");
            }
        }, config.domPollIntervalMs || 50);
    }

    /**
     * @public
     * @description Binds standard D3 mouse-wheel zoom and click-and-drag panning to a target SVG.
     * @param {string} sRenderId - The DOM ID containing the injected SVG.
     */
    public static attachStandardZoom(sRenderId: string): void {
        const config = ConfigManager.get();
        
        NetworkManager.loadScript(config.cdnPaths?.d3).then(() => {
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