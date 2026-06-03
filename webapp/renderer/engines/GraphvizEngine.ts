/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Graphviz / WASM rendering implementation.
 * @description Integrates D3 Graphviz for client-side DOT rendering.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";
import DomManager from "../DomManager";

declare const d3: any;

export default class GraphvizEngine {
    
    public static configPath = "/formatGraphviz";
    public static supportsMinimap = false;
    public static supportsSearch = false;
    public static supportsSourceExport = true;
    public static supportsImageExport = true;

    /**
     * @public
     * @returns {number} The maximum supported payload size in KB.
     * @description Provides the standard limit for Graphviz WASM rendering.
     */
    public static getMaxPayloadSize(): number {
        return 100;
    }

    /**
     * @public
     * @static
     * @description Provides the baseline default configuration for the UI Model.
     */
    public static getDefaultConfig(): Record<string, any> {
        return { lineStyle: "default", spaced_out: false, modern: true, left_to_right: false, concentrate_edges: false, monochrome: false };
    }

    /**
     * @public
     * @static
     * @description Formats the raw UI configuration for the backend payload.
     */
    public static formatBackendConfig(oRawConfig: Record<string, any>): Record<string, any> {
        const oFormatConfig = Object.assign({}, oRawConfig);
        oFormatConfig.ortho = (oFormatConfig.lineStyle === "ortho");
        oFormatConfig.polyline = (oFormatConfig.lineStyle === "polyline");
        delete oFormatConfig.lineStyle;
        return oFormatConfig;
    }

    /**
     * @public
     * @description Handled by the UI5 Fiori DomManager clearing the innerHTML.
     */
    public static destroy(sViewId: string): void {
        // No explicit persistent memory instances required for D3 selections.
    }

    /**
     * @public
     * @static
     * @description Executes DOT syntax against the Graphviz engine in the active view.
     * @param {string} sPayload - DOT Syntax
     * @param {string} sRenderId - DOM Element target
     * @param {Function} fnOnError - Error handler
     * @returns {Promise<void>}
     */
    public static async render(sViewId: string, sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): Promise<void> {
        const config = ConfigManager.get();

        try {
            await NetworkManager.loadScript(config.localPaths?.d3, config.cdnPaths?.d3);
            await NetworkManager.loadScript(config.localPaths?.graphvizWasm, config.cdnPaths?.graphvizWasm);
            await NetworkManager.loadScript(config.localPaths?.graphvizPlugin, config.cdnPaths?.graphvizPlugin);

            if (typeof d3.select("body").graphviz !== "function") {
                throw new Error("d3-graphviz plugin failed to bind to global D3 object.");
            }

            d3.select(`#${sRenderId}`)
                .graphviz({ useWorker: false })
                .tweenPaths(false)  
                .tweenShapes(false)
                .fit(true)
                .zoom(false)
                .on("renderEnd", () => {
                    // Graphviz relies on a critical initial transform on <g id="graph0"> to flip the Y-axis.
                    // The standard zoom manager attaches a d3 zoom behavior which overwrites the transform 
                    // of the first <g> element upon the first zoom/pan, causing the diagram to jump.
                    // We wrap graph0 in an identity <g> so the zoom manager targets the wrapper instead.
                    const oSvg = document.querySelector(`#${sRenderId} svg`);
                    const oGraph = oSvg?.querySelector("#graph0");
                    if (oSvg && oGraph && oGraph.parentNode) {
                        const oWrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
                        oWrapper.id = "graphviz-zoom-wrapper";
                        oGraph.parentNode.insertBefore(oWrapper, oGraph);
                        oWrapper.appendChild(oGraph);
                    }

                    // Delegate zoom and pan to the standard DOM Manager
                    // so it can seamlessly sync with the custom minimap
                    DomManager.attachStandardZoom(sRenderId);
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
    public static async exportSvg(sPayload: string, sViewId?: string): Promise<string> {
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
                    .graphviz({ useWorker: false })
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