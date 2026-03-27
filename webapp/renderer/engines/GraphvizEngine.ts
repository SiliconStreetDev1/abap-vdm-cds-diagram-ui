/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Graphviz / WASM rendering implementation.
 * @description Integrates D3 Graphviz for client-side DOT rendering.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";

declare const d3: any;

export default class GraphvizEngine {
    
    /**
     * @public
     * @static
     * @description Executes DOT syntax against the Graphviz engine in the active view.
     * @param {string} sPayload - DOT Syntax
     * @param {string} sRenderId - DOM Element target
     * @param {Function} fnOnError - Error handler
     * @returns {Promise<void>}
     */
    public static async render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): Promise<void> {
        const config = ConfigManager.get();

        try {
            await NetworkManager.loadScript(config.localPaths?.d3, config.cdnPaths?.d3);
            await NetworkManager.loadScript(config.localPaths?.graphvizWasm, config.cdnPaths?.graphvizWasm);
            await NetworkManager.loadScript(config.localPaths?.graphvizPlugin, config.cdnPaths?.graphvizPlugin);

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

    /**
     * @public
     * @static
     * @description Headless execution context for Graphviz. Spawns an isolated D3 instance 
     * in an unattached DOM fragment to generate a clean, independent SVG string.
     * @param {string} sPayload - The raw DOT syntax.
     * @returns {Promise<string>} A promise resolving to the raw SVG string.
     */
    public static async exportSvg(sPayload: string): Promise<string> {
        const config = ConfigManager.get();
        await NetworkManager.loadScript(config.localPaths?.d3, config.cdnPaths?.d3);
        await NetworkManager.loadScript(config.localPaths?.graphvizWasm, config.cdnPaths?.graphvizWasm);
        await NetworkManager.loadScript(config.localPaths?.graphvizPlugin, config.cdnPaths?.graphvizPlugin);

        return new Promise((resolve, reject) => {
            try {
                if (typeof d3.select("body").graphviz !== "function") {
                    throw new Error("d3-graphviz plugin failed to bind.");
                }

                // Spawns D3 render in a completely detached document fragment
                const oDetachedDiv = document.createElement("div");
                
                d3.select(oDetachedDiv)
                    .graphviz()
                    .tweenPaths(false)
                    .tweenShapes(false)
                    .zoom(false) // Disable zoom behaviors for static export
                    .on("end", () => {
                        resolve(oDetachedDiv.innerHTML);
                    })
                    .renderDot(sPayload);
                    
            } catch (e: any) {
                reject(new Error(`Graphviz Export Error: ${e.message}`));
            }
        });
    }
}