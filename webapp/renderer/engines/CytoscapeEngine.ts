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
import CytoscapeDependencyLoader from "./cytoscape/CytoscapeDependencyLoader";
import CytoscapeLayoutManager from "./cytoscape/CytoscapeLayoutManager";
import CytoscapeContextMenu from "./cytoscape/CytoscapeContextMenu";
import CytoscapeNoteManager from "./cytoscape/CytoscapeNoteManager";
import CytoscapeStateManager from "./cytoscape/CytoscapeStateManager";
import CytoscapeVisibilityManager from "./cytoscape/CytoscapeVisibilityManager";
import CytoscapeInteractionManager from "./cytoscape/CytoscapeInteractionManager";
import { DomEvents } from "../../constants/EventConstants";

declare const cytoscape: any;

export default class CytoscapeEngine {

    /**
     * @private
     * @description Holds the singleton instance of the Cytoscape canvas.
     */
    private static _cyInstances: Map<string, any> = new Map();
    private static _navInstances: Map<string, any> = new Map();
    private static _bShowMinimaps: Map<string, boolean> = new Map();
    private static _sLastLayouts: Map<string, string> = new Map();
    private static _oLastParsedConfigs: Map<string, any> = new Map();
    private static _bSnapGuides: Map<string, boolean> = new Map();
    private static _fnMinimapCleanups: Map<string, (() => void)> = new Map();

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
    public static render(sViewId: string, sPayload: string, sRenderId: string, fnOnError: (msg: string) => void, oConfig?: ICytoscapeConfig): void {
        CytoscapeDependencyLoader.load().then(() => {
                try {
                    const oData = JSON.parse(sPayload);
                    
                    // Fiori UI binds to formatCytoscape. Fallback to format for legacy payloads.
                    const oFormat = oConfig || oData.config?.formatCytoscape || oData.config?.format || {};
                    const parsedConfig = CytoscapeConfigParser.parse(oFormat);
                    
                    const iNodeCount = oData.nodes ? oData.nodes.length : 0;
                    this._oLastParsedConfigs.set(sViewId, parsedConfig);
                    this._sLastLayouts.set(sViewId, parsedConfig.layout);
                    this._bSnapGuides.set(sViewId, parsedConfig.snapGuides);

                    const oContainer = document.getElementById(sRenderId);
                    if (!oContainer) {
                        fnOnError("Cytoscape Render Error: Target DOM container not found.");
                        return;
                    }

                // Ensure container has an explicit background to prevent black screen in native fullscreen mode
                oContainer.style.backgroundColor = parsedConfig.theme === 'fiori_dark' ? '#29313a' : 'var(--sapBackgroundColor, #ffffff)';

                    // Destroy existing instance to prevent memory leaks and duplicate canvases
                    this.destroy(sViewId);

                    // Unpack Arrays and format Labels for display
                    CytoscapeDataProcessor.process(oData.nodes || [], oData.edges || []);

                    // Prevent Cytoscape crash from invalid edges
                    if (oData.nodes && oData.edges) {
                        const aNodeIds = new Set(oData.nodes.map((n: any) => n.data.id));
                        oData.edges = oData.edges.filter((e: any) => aNodeIds.has(e.data.source) && aNodeIds.has(e.data.target));
                    }

                    // Initialize Graph
                    const cyInstance = cytoscape({
                        container: oContainer,
                        elements: {
                            nodes: oData.nodes || [],
                            edges: oData.edges || []
                        },
                        style: CytoscapeStyleBuilder.build(parsedConfig),

                        // Force higher pixel ratio for crisp Canvas rendering when zoomed out
                        pixelRatio: typeof window !== "undefined" ? Math.max(window.devicePixelRatio || 1, 2) : 2,
                        minZoom: 0.1,
                        maxZoom: 3.0,
                        wheelSensitivity: 0.2,
                        userPanningEnabled: true, // Syncs with Fiori View Model default (Pan Mode)
                        boxSelectionEnabled: true,
                        selectionType: 'single'
                    });
                    
                    this._cyInstances.set(sViewId, cyInstance);

                    // Inject visual styling for Sticky Notes and Edges
                    CytoscapeStyleBuilder.injectAnnotationStyles(cyInstance);

                    CytoscapeLayoutManager.applyGridGuide(cyInstance, parsedConfig);
                    
                    if (parsedConfig.camera) {
                        cyInstance.viewport(parsedConfig.camera);
                    }

                    CytoscapeLayoutManager.applyHybridLayout(sViewId, cyInstance, parsedConfig, iNodeCount);

                    CytoscapeEventHandler.attachEvents(sViewId, cyInstance, parsedConfig.isDrillDown);
                    CytoscapeEventHandler.attachGridSnapEvent(cyInstance, () => this._bSnapGuides.get(sViewId) || false);
                    CytoscapeContextMenu.attach(sViewId, cyInstance, parsedConfig.isDrillDown);

                    // Delegate note lifecycle to specialized manager
                    CytoscapeNoteManager.attachEvents(sViewId, cyInstance);

                    this.toggleMinimap(sViewId, this._bShowMinimaps.get(sViewId) || false);

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
    public static updateFormat(sViewId: string, oConfig: ICytoscapeConfig): void {
        const cyInstance = this._cyInstances.get(sViewId);
        if (cyInstance) {
            const parsedConfig = CytoscapeConfigParser.parse(oConfig);
            const iNodeCount = cyInstance.nodes().length;
            
            this._oLastParsedConfigs.set(sViewId, parsedConfig);
            const bIsLayoutChange = parsedConfig.layout !== this._sLastLayouts.get(sViewId);
            this._sLastLayouts.set(sViewId, parsedConfig.layout);
            this._bSnapGuides.set(sViewId, parsedConfig.snapGuides);
            
            const oContainer = cyInstance.container();
            if (oContainer) {
                oContainer.style.backgroundColor = parsedConfig.theme === 'fiori_dark' ? '#29313a' : 'var(--sapBackgroundColor, #ffffff)';
            }
            
            if (bIsLayoutChange) {
                cyInstance.nodes().unlock();
                parsedConfig.camera = null; // Drop camera to allow auto-fit on layout change
            }

            // 1. Update visual styles dynamically
            cyInstance.style(CytoscapeStyleBuilder.build(parsedConfig));
            
            // 2. Update Alignment Guides dynamically
            CytoscapeLayoutManager.applyGridGuide(cyInstance, parsedConfig);

            // 3. Re-inject visual styling for Sticky Notes so they survive format updates
            CytoscapeStyleBuilder.injectAnnotationStyles(cyInstance);

            // 4. Rerun the physical layout using the centralized hybrid rules
            CytoscapeLayoutManager.applyHybridLayout(sViewId, cyInstance, parsedConfig, iNodeCount);
        }
    }

    /**
     * @public
     * @static
     * @description Modifies Cytoscape's internal event listeners to switch between standard 
     * canvas panning and node selection/dragging mode.
     * @param {"pan" | "select"} sMode - The desired mouse behavior mode.
     */
    public static setInteractionMode(sViewId: string, sMode: "pan" | "select"): void {
        CytoscapeInteractionManager.setInteractionMode(this._cyInstances.get(sViewId), sMode);
    }

    /**
     * @public
     * @description Drops all active selections from the graph.
     */
    public static clearSelection(sViewId: string): void {
        CytoscapeInteractionManager.clearSelection(this._cyInstances.get(sViewId));
    }

    /**
     * @public
     * @description Toggles the visibility of the Cytoscape minimap (Bird's Eye View).
     * @param {boolean} bShow - True to enable the minimap, false to destroy it.
     */
    public static toggleMinimap(sViewId: string, bShow: boolean): void {
        this._bShowMinimaps.set(sViewId, bShow);
        const cyInstance = this._cyInstances.get(sViewId);
        if (cyInstance) {
            let navInstance = this._navInstances.get(sViewId);
            if (bShow) {
                if (!navInstance && typeof cyInstance.navigator === "function") {
                    navInstance = cyInstance.navigator({ container: false });
                    this._navInstances.set(sViewId, navInstance);
                    const navElem = navInstance.$panel;
                    if (navElem) {
                        this._fnMinimapCleanups.set(sViewId, MinimapManager.enhancePanel(sViewId, navElem, cyInstance));
                    }
                    cyInstance.one("render", () => { if (this._cyInstances.get(sViewId)) this._cyInstances.get(sViewId).resize(); });
                }
            } else if (navInstance) {
                const fnCleanup = this._fnMinimapCleanups.get(sViewId);
                if (fnCleanup) {
                    fnCleanup();
                    this._fnMinimapCleanups.delete(sViewId);
                }
                navInstance.destroy();
                this._navInstances.delete(sViewId);
            }
            if (bShow) cyInstance.emit('render');
        }
    }

    /**
     * @public
     * @description Destroys the active Cytoscape instance and cleans up memory.
     */
    public static destroy(sViewId: string): void {
        const cyInstance = this._cyInstances.get(sViewId);
        if (cyInstance) {
            const navInstance = this._navInstances.get(sViewId);
            if (navInstance) {
                const fnCleanup = this._fnMinimapCleanups.get(sViewId);
                if (fnCleanup) {
                    fnCleanup();
                    this._fnMinimapCleanups.delete(sViewId);
                }
                navInstance.destroy();
                this._navInstances.delete(sViewId);
            }
            CytoscapeNoteManager.detachEvents(sViewId);
            CytoscapeContextMenu.removeAll(sViewId);
            cyInstance.destroy();
            this._cyInstances.delete(sViewId);
        }
    }

    /**
     * @public
     * @description Exports the current canvas view as a base64 encoded PNG string.
     * @returns {string} Base64 PNG data URI.
     */
    public static exportPng(sViewId: string): string {
        return CytoscapeExporter.exportPng(this._cyInstances.get(sViewId));
    }

    /**
     * @public
     * @description Exports the current canvas view as a zoomable, centered SVG string.
     * Applies internal CSS for centering while retaining physical dimensions to enable browser scroll-to-zoom.
     * @returns {string} Formatted SVG XML string.
     */
    public static exportSvg(sViewId: string): string {
        return CytoscapeExporter.exportSvg(this._cyInstances.get(sViewId));
    }

    /**
     * @public
     * @description Searches for nodes matching the query and focuses the camera on them.
     * @param {string} sQuery - The text to search for
     */
    public static search(sViewId: string, sQuery: string): void {
        CytoscapeSearchManager.search(this._cyInstances.get(sViewId), sQuery);
    }

    /**
     * @public
     * @description Restores all hidden nodes to the canvas and notifies the UI.
     */
    public static showHiddenNodes(sViewId: string): void {
        CytoscapeVisibilityManager.showHiddenNodes(sViewId, this._cyInstances.get(sViewId));
    }

    /**
     * @public
     * @description Selectively restores specifically identified nodes to the canvas.
     * @param {string[]} aNodeIds - Array of internal node IDs to restore.
     */
    public static showSpecificNodes(sViewId: string, aNodeIds: string[]): void {
        CytoscapeVisibilityManager.showSpecificNodes(sViewId, this._cyInstances.get(sViewId), aNodeIds);
    }

    /**
     * @public
     * @description Returns the X/Y coordinates of all current nodes for variant persistence.
     */
    public static getCanvasState(sViewId: string): Record<string, any> {
        return CytoscapeStateManager.getCanvasState(this._cyInstances.get(sViewId));
    }
}