/**
 * @fileoverview Cytoscape.js rendering implementation for interactive ER graphs.
 * @description Translates backend JSON into an interactive Fiori-styled canvas.
 * Edge labels contain Association + Cardinality, while Entity boxes display 
 * only Base Views, Keys, and Standard Fields to eliminate redundancy.
 * Supports offline/local-first loading, CDN fallback, and SVG/PNG exports.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";
import MinimapManager from "./MinimapManager";
import CytoscapeConfigParser from "./cytoscape/CytoscapeConfigParser";
import CytoscapeStyleBuilder from "./cytoscape/CytoscapeStyleBuilder";
import CytoscapeLayoutBuilder from "./cytoscape/CytoscapeLayoutBuilder";
import CytoscapeDataProcessor from "./cytoscape/CytoscapeDataProcessor";
import CytoscapeExporter from "./cytoscape/CytoscapeExporter";
import CytoscapeSearchManager from "./cytoscape/CytoscapeSearchManager";
import CytoscapeEventHandler from "./cytoscape/CytoscapeEventHandler";
import { ICytoscapeConfig } from "./IEngineFacade";

declare const cytoscape: any;

export default class CytoscapeEngine {

    /**
     * @private
     * @description Holds the singleton instance of the Cytoscape canvas.
     */
    private static _cyInstance: any = null;
    private static _navInstance: any = null;
    private static _bShowMinimap: boolean = false;

    public static supportsMinimap = true;
    public static supportsSearch = true;

    /**
     * @public
     * @returns {number} The maximum supported payload size in KB.
     * @description Cytoscape uses WebGL/Canvas and can handle much larger graph payloads natively.
     */
    public static getMaxPayloadSize(): number {
        return 200;
    }

    /**
     * @public
     * @description Initializes and renders the Cytoscape graph inside the target DOM container.
     * Fetches dependencies using local-first/CDN-fallback strategies before execution.
     * @param {string} sPayload - The JSON payload containing nodes, edges, and config.
     * @param {string} sRenderId - The DOM element ID where the canvas will be injected.
     * @param {function} fnOnError - Callback function to handle rendering errors.
     * @param {any} [oConfig] - Cytoscape formatting config
     */
    public static render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void, oConfig?: ICytoscapeConfig): void {
        const config = ConfigManager.get();

        // Chain the core engine and then the SVG plugin using local-first resolution with Integrity checking
        NetworkManager.loadScript(config.localPaths?.cytoscape, config.cdnPaths?.cytoscape)
            .then(() => NetworkManager.loadScript(config.localPaths?.dagre, config.cdnPaths?.dagre))
            .then(() => NetworkManager.loadScript(config.localPaths?.cytoscapeDagre, config.cdnPaths?.cytoscapeDagre))
            .then(() => NetworkManager.loadScript(config.localPaths?.elk, config.cdnPaths?.elk))
            .then(() => NetworkManager.loadScript(config.localPaths?.cytoscapeElk, config.cdnPaths?.cytoscapeElk))
            .then(() => {
                const cyElk = (window as any).cytoscapeElk;
                if (cyElk && typeof cytoscape.use === "function") {
                    try { cytoscape.use(cyElk); } catch(e) {}
                }
            })
            .then(() => {
                return NetworkManager.loadScript(config.localPaths?.navigatorJs, config.cdnPaths?.navigatorJs);
            })
            .then(() => {
                const nav = (window as any).cytoscapeNavigator;
                if (nav && typeof cytoscape.use === "function") {
                    try { cytoscape.use(nav); } catch(e) {}
                }
            })
            .then(() => NetworkManager.loadScript(config.localPaths?.cytoscapeSvg, config.cdnPaths?.cytoscapeSvg))
            .then(() => {
                try {
                    const oData = JSON.parse(sPayload);
                    
                    // Fiori UI binds to formatCytoscape. Fallback to format for legacy payloads.
                    const oFormat = oConfig || oData.config?.formatCytoscape || oData.config?.format || {};
                    const parsedConfig = CytoscapeConfigParser.parse(oFormat);

                    const oContainer = document.getElementById(sRenderId);
                    if (!oContainer) {
                        fnOnError("Cytoscape Render Error: Target DOM container not found.");
                        return;
                    }

                    // Destroy existing instance to prevent memory leaks and duplicate canvases
                    this.destroy();

                    // Unpack Arrays and format Labels for display
                    CytoscapeDataProcessor.process(oData.nodes || [], oData.edges || []);

                    // Initialize Graph
                    this._cyInstance = cytoscape({
                        container: oContainer,
                        elements: {
                            nodes: oData.nodes || [],
                            edges: oData.edges || []
                        },
                        style: CytoscapeStyleBuilder.build(parsedConfig),
                        layout: CytoscapeLayoutBuilder.build(parsedConfig),

                        // Force higher pixel ratio for crisp Canvas rendering when zoomed out
                        pixelRatio: typeof window !== "undefined" ? Math.max(window.devicePixelRatio || 1, 2) : 2,
                        minZoom: 0.1,
                        maxZoom: 3.0,
                        wheelSensitivity: 0.2,
                        boxSelectionEnabled: true,
                        selectionType: 'additive'
                    });

                    CytoscapeEventHandler.attachEvents(this._cyInstance);

                    this.toggleMinimap(this._bShowMinimap);

                } catch (e: any) {
                    fnOnError(`Cytoscape Parsing Error. Details: ${e.message}`);
                }
            }).catch((oNetworkError: any) => {
                fnOnError(`Cytoscape Loading Error: ${oNetworkError.message || oNetworkError}`);
            });
    }

    /**
     * @public
     * @static
     * @description Dynamically updates the active Cytoscape instance with new layout and style configurations without a full re-render.
     * @param {any} oConfig - The updated formatting configuration.
     */
    public static updateFormat(oConfig: ICytoscapeConfig): void {
        if (this._cyInstance) {
            const parsedConfig = CytoscapeConfigParser.parse(oConfig);
            
            // 1. Update visual styles dynamically
            this._cyInstance.style(CytoscapeStyleBuilder.build(parsedConfig));
            
            // 2. Rerun the physical layout with the new rules
            const layoutConfig = CytoscapeLayoutBuilder.build(parsedConfig);
            this._cyInstance.layout(layoutConfig).run();
        }
    }

    /**
     * @public
     * @description Toggles the visibility of the Cytoscape minimap (Bird's Eye View).
     * @param {boolean} bShow - True to enable the minimap, false to destroy it.
     */
    public static toggleMinimap(bShow: boolean): void {
        this._bShowMinimap = bShow;
        if (this._cyInstance) {
            if (bShow) {
                if (!this._navInstance && typeof this._cyInstance.navigator === "function") {
                    this._navInstance = this._cyInstance.navigator({ container: false });
                    const navElem = this._navInstance.$panel;
                    if (navElem) MinimapManager.enhancePanel(navElem, this._cyInstance, this._navInstance);
                    this._cyInstance.one("render", () => { if (this._cyInstance) this._cyInstance.resize(); });
                }
            } else if (this._navInstance) {
                this._navInstance.destroy();
                this._navInstance = null;
            }
            if (bShow) this._cyInstance.emit('render');
        }
    }

    /**
     * @public
     * @description Destroys the active Cytoscape instance and cleans up memory.
     */
    public static destroy(): void {
        if (this._cyInstance) {
            if (this._navInstance) {
                this._navInstance.destroy();
                this._navInstance = null;
            }
            this._cyInstance.destroy();
            this._cyInstance = null;
        }
    }

    /**
     * @public
     * @description Exports the current canvas view as a base64 encoded PNG string.
     * @returns {string} Base64 PNG data URI.
     */
    public static exportPng(): string {
        return CytoscapeExporter.exportPng(this._cyInstance);
    }

    /**
     * @public
     * @description Exports the current canvas view as a zoomable, centered SVG string.
     * Applies internal CSS for centering while retaining physical dimensions to enable browser scroll-to-zoom.
     * @returns {string} Formatted SVG XML string.
     */
    public static exportSvg(): string {
        return CytoscapeExporter.exportSvg(this._cyInstance);
    }

    /**
     * @public
     * @description Searches for nodes matching the query and focuses the camera on them.
     * @param {string} sQuery - The text to search for
     */
    public static search(sQuery: string): void {
        CytoscapeSearchManager.search(this._cyInstance, sQuery);
    }
}