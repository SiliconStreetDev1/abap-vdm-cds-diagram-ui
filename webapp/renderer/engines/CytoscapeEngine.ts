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
import { DomEvents } from "../../constants/EventConstants";

declare const cytoscape: any;

export default class CytoscapeEngine {

    /**
     * @private
     * @description Holds the singleton instance of the Cytoscape canvas.
     */
    private static _cyInstance: any = null;
    private static _navInstance: any = null;
    private static _bShowMinimap: boolean = false;
    private static _sLastLayout: string = "";
    private static _oLastParsedConfig: any = null;
    private static _bSnapGuides: boolean = false;
    private static _fnMinimapCleanup: (() => void) | null = null;

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
        CytoscapeDependencyLoader.load().then(() => {
                try {
                    const oData = JSON.parse(sPayload);
                    
                    // Fiori UI binds to formatCytoscape. Fallback to format for legacy payloads.
                    const oFormat = oConfig || oData.config?.formatCytoscape || oData.config?.format || {};
                    const parsedConfig = CytoscapeConfigParser.parse(oFormat);
                    
                    const iNodeCount = oData.nodes ? oData.nodes.length : 0;
                    this._oLastParsedConfig = parsedConfig;
                    this._sLastLayout = parsedConfig.layout;
                    this._bSnapGuides = parsedConfig.snapGuides;

                    const oContainer = document.getElementById(sRenderId);
                    if (!oContainer) {
                        fnOnError("Cytoscape Render Error: Target DOM container not found.");
                        return;
                    }

                    // Destroy existing instance to prevent memory leaks and duplicate canvases
                    this.destroy();

                    // Unpack Arrays and format Labels for display
                    CytoscapeDataProcessor.process(oData.nodes || [], oData.edges || []);

                    // Prevent Cytoscape crash from invalid edges
                    if (oData.nodes && oData.edges) {
                        const aNodeIds = new Set(oData.nodes.map((n: any) => n.data.id));
                        oData.edges = oData.edges.filter((e: any) => aNodeIds.has(e.data.source) && aNodeIds.has(e.data.target));
                    }

                    // Initialize Graph
                    this._cyInstance = cytoscape({
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

                    CytoscapeLayoutManager.applyGridGuide(this._cyInstance, parsedConfig);
                    CytoscapeLayoutManager.applyHybridLayout(this._cyInstance, parsedConfig, iNodeCount);

                    CytoscapeEventHandler.attachEvents(this._cyInstance);
                    CytoscapeEventHandler.attachGridSnapEvent(this._cyInstance, () => this._bSnapGuides);
                    CytoscapeContextMenu.attach(this._cyInstance);

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
            const iNodeCount = this._cyInstance.nodes().length;
            
            this._oLastParsedConfig = parsedConfig;
            const bIsLayoutChange = parsedConfig.layout !== this._sLastLayout;
            this._sLastLayout = parsedConfig.layout;
            this._bSnapGuides = parsedConfig.snapGuides;
            
            if (bIsLayoutChange) {
                this._cyInstance.nodes().unlock();
                parsedConfig.presetPositions = null; // Explicitly flush so we don't re-lock during the layout switch
                if (typeof document !== "undefined") {
                    document.dispatchEvent(new CustomEvent(DomEvents.LAYOUT_UNLOCKED));
                }
            }

            // 1. Update visual styles dynamically
            this._cyInstance.style(CytoscapeStyleBuilder.build(parsedConfig));
            
            // 2. Update Alignment Guides dynamically
            CytoscapeLayoutManager.applyGridGuide(this._cyInstance, parsedConfig);

            // 3. Rerun the physical layout using the centralized hybrid rules
            CytoscapeLayoutManager.applyHybridLayout(this._cyInstance, parsedConfig, iNodeCount);
        }
    }

    /**
     * @public
     * @description Toggles the layout locking constraint on all nodes.
     */
    public static setNodesLocked(bLocked: boolean): void {
        if (this._cyInstance) {
            if (bLocked) {
                this._cyInstance.nodes().lock();
            } else {
                    this._cyInstance.nodes().filter((n: any) => !n.data('isPinned')).unlock();
            }
        }
    }

    /**
     * @public
     * @description Forces a manual layout recalculation on all unlocked nodes.
     */
    public static runLayout(): void {
        if (this._cyInstance && this._oLastParsedConfig) {
            const iNodeCount = this._cyInstance.nodes().length;
            this._oLastParsedConfig.presetPositions = null; // Guarantee the engine forgets coordinates on a forced auto-layout
            CytoscapeLayoutManager.applyHybridLayout(this._cyInstance, this._oLastParsedConfig, iNodeCount);
        }
    }

    /**
     * @public
     * @static
     * @description Modifies Cytoscape's internal event listeners to switch between standard 
     * canvas panning and node selection/dragging mode.
     * @param {"pan" | "select"} sMode - The desired mouse behavior mode.
     */
    public static setInteractionMode(sMode: "pan" | "select"): void {
        if (this._cyInstance) {
            if (sMode === "select") {
                this._cyInstance.userPanningEnabled(false);
                this._cyInstance.boxSelectionEnabled(true);
                this._cyInstance.autoungrabify(false);
            } else {
                this._cyInstance.userPanningEnabled(true);
                this._cyInstance.boxSelectionEnabled(true); // Shift+Drag fallback
            }
        }
    }

    /**
     * @public
     * @description Drops all active selections from the graph.
     */
    public static clearSelection(): void {
        if (this._cyInstance) {
            this._cyInstance.elements().unselect();
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
                    if (navElem) {
                        this._fnMinimapCleanup = MinimapManager.enhancePanel(navElem, this._cyInstance);
                    }
                    this._cyInstance.one("render", () => { if (this._cyInstance) this._cyInstance.resize(); });
                }
            } else if (this._navInstance) {
                if (this._fnMinimapCleanup) {
                    this._fnMinimapCleanup();
                    this._fnMinimapCleanup = null;
                }
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
                if (this._fnMinimapCleanup) {
                    this._fnMinimapCleanup();
                    this._fnMinimapCleanup = null;
                }
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

    /**
     * @public
     * @description Restores all hidden nodes to the canvas and notifies the UI.
     */
    public static showHiddenNodes(): void {
        if (this._cyInstance) {
            this._cyInstance.nodes('.hidden').removeClass('hidden').data('isHidden', false);
            if (typeof document !== "undefined") {
                document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { hasHidden: false } }));
                document.dispatchEvent(new CustomEvent(DomEvents.NODE_UNHIDDEN, {}));
            }
        }
    }

    /**
     * @public
     * @description Returns the X/Y coordinates of all current nodes for variant persistence.
     */
    public static getCanvasState(): Record<string, {x: number, y: number, isPinned?: boolean, isHidden?: boolean}> {
        const state: Record<string, {x: number, y: number, isPinned?: boolean, isHidden?: boolean}> = {};
        if (this._cyInstance) {
            this._cyInstance.nodes().forEach((n: any) => {
                state[n.data('id')] = { ...n.position() };
                state[n.data('id')].isPinned = !!n.data('isPinned');
                state[n.data('id')].isHidden = n.hasClass('hidden') || !!n.data('isHidden');
            });
        }
        return state;
    }
}