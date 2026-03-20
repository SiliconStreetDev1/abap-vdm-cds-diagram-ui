/**
 * @fileoverview Graphviz / WASM specific rendering implementation.
 */
import { CONFIG } from "../util/DiagramConfig";
import NetworkManager from "../util/NetworkManager";

declare const d3: any;

export default class GraphvizEngine {
    
    /**
     * @public
     * @description Executes DOT syntax against the Graphviz WASM engine. Intercepts the 
     * renderEnd event to override hardcoded physical dimensions, enforcing 100% width/height
     * responsive behaviors for unrestricted D3 zooming inside UI5 containers.
     * @param {string} sPayload - The raw DOT syntax.
     * @param {string} sRenderId - The target DOM container ID.
     * @param {(msg: string) => void} fnOnError - Error callback.
     * @returns {Promise<void>}
     */
    public static async render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): Promise<void> {
        try {
            await NetworkManager.loadScript(CONFIG.CDN.D3);
            await NetworkManager.loadScript(CONFIG.CDN.GRAPHVIZ_WASM);
            await NetworkManager.loadScript(CONFIG.CDN.GRAPHVIZ_PLUGIN);

            if (typeof d3.select("body").graphviz !== "function") {
                throw new Error("d3-graphviz plugin failed to bind to global D3 object.");
            }

            d3.select(`#${sRenderId}`)
                .graphviz()
                .tweenPaths(false)  
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
}