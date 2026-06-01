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

                // Ensure container has an explicit background to prevent black screen in native fullscreen mode
                oContainer.style.backgroundColor = parsedConfig.theme === 'fiori_dark' ? '#29313a' : 'var(--sapBackgroundColor, #ffffff)';

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

                    // Inject visual styling for Sticky Notes and Edges
                    this._injectAnnotationStyles();

                    CytoscapeLayoutManager.applyGridGuide(this._cyInstance, parsedConfig);
                    
                    if (parsedConfig.camera) {
                        this._cyInstance.viewport(parsedConfig.camera);
                    }

                    CytoscapeLayoutManager.applyHybridLayout(this._cyInstance, parsedConfig, iNodeCount);

                    CytoscapeEventHandler.attachEvents(this._cyInstance, parsedConfig.isDrillDown);
                    CytoscapeEventHandler.attachGridSnapEvent(this._cyInstance, () => this._bSnapGuides);
                    CytoscapeContextMenu.attach(this._cyInstance, parsedConfig.isDrillDown);

                    // Delegate note lifecycle to specialized manager
                    CytoscapeNoteManager.attachEvents(this._cyInstance);

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
            
            const oContainer = this._cyInstance.container();
            if (oContainer) {
                oContainer.style.backgroundColor = parsedConfig.theme === 'fiori_dark' ? '#29313a' : 'var(--sapBackgroundColor, #ffffff)';
            }
            
            if (bIsLayoutChange) {
                this._cyInstance.nodes().unlock();
                parsedConfig.camera = null; // Drop camera to allow auto-fit on layout change
            }

            // 1. Update visual styles dynamically
            this._cyInstance.style(CytoscapeStyleBuilder.build(parsedConfig));
            
            // 2. Update Alignment Guides dynamically
            CytoscapeLayoutManager.applyGridGuide(this._cyInstance, parsedConfig);

            // 3. Re-inject visual styling for Sticky Notes so they survive format updates
            this._injectAnnotationStyles();

            // 4. Rerun the physical layout using the centralized hybrid rules
            CytoscapeLayoutManager.applyHybridLayout(this._cyInstance, parsedConfig, iNodeCount);
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
            CytoscapeNoteManager.detachEvents();
            CytoscapeContextMenu.removeAll();
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
                document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { hasHidden: false, hiddenNodes: [] } }));
                document.dispatchEvent(new CustomEvent(DomEvents.NODE_UNHIDDEN, {}));
            }
        }
    }

    /**
     * @public
     * @description Selectively restores specifically identified nodes to the canvas.
     * @param {string[]} aNodeIds - Array of internal node IDs to restore.
     */
    public static showSpecificNodes(aNodeIds: string[]): void {
        if (this._cyInstance && aNodeIds && aNodeIds.length > 0) {
            const selector = aNodeIds.map(id => `#${id}`).join(', ');
            this._cyInstance.nodes(selector).removeClass('hidden').data('isHidden', false);
            const remainingHidden = this._cyInstance.nodes('.hidden');
            const hiddenList = remainingHidden.map((n: any) => ({ id: n.data('id'), label: n.data('label') || n.data('id') }));
            if (typeof document !== "undefined") {
                document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { hasHidden: remainingHidden.length > 0, hiddenNodes: hiddenList } }));
                document.dispatchEvent(new CustomEvent(DomEvents.NODE_UNHIDDEN, {}));
            }
        }
    }

    /**
     * @public
     * @description Returns the X/Y coordinates of all current nodes for variant persistence.
     */
    public static getCanvasState(): Record<string, any> {
        const state: Record<string, any> = {};
        if (this._cyInstance) {
            state.__camera = {
                zoom: this._cyInstance.zoom(),
                pan: this._cyInstance.pan()
            };
            this._cyInstance.nodes().forEach((n: any) => {
                state[n.data('id')] = { ...n.position() };
                state[n.data('id')].isPinned = !!n.data('isPinned');
                state[n.data('id')].isHidden = n.hasClass('hidden') || !!n.data('isHidden');
                if (n.hasClass('annotation-note')) {
                    state[n.data('id')].isNote = true;
                    state[n.data('id')].label = n.data('label');
                    state[n.data('id')].bgColor = n.data('bgColor');
                    state[n.data('id')].borderColor = n.data('borderColor');
                    state[n.data('id')].fontFamily = n.data('fontFamily');
                }
            });
            
            this._cyInstance.edges('.annotation-edge').forEach((e: any) => {
                state[e.data('id')] = {
                    isEdge: true,
                    source: e.data('source'),
                    target: e.data('target')
                };
            });
        }
        return state;
    }

    /**
     * @private
     * @static
     * @description Re-injects visual styling for Sticky Notes so they survive format updates and have proper content mappings.
     */
    private static _injectAnnotationStyles(): void {
        if (!this._cyInstance) return;
        this._cyInstance.style()
            .selector('edge').style({
                'control-point-step-size': 46
            })
            .selector('.annotation-note').style({
                'content': 'data(label)',
                'shape': 'round-rectangle',
                'background-color': (ele: any) => ele.data('bgColor') || '#fff9c4',
                'background-opacity': 0.95,
                'border-color': (ele: any) => ele.data('borderColor') || '#fbc02d',
                'border-width': 1,
                'color': '#333333',
                'text-wrap': 'wrap',
                'text-max-width': '200px',
                'width': 'label',
                'height': 'label',
                'padding': '16px',
                'text-valign': 'center',
                'text-halign': 'center',
                'font-family': (ele: any) => {
                    switch(ele.data('fontFamily')) {
                        case 'Standard': return '"72", Arial, Helvetica, sans-serif';
                        case 'Monospace': return 'monospace';
                        case 'Serif': return '"Times New Roman", Times, serif';
                        default: return '"Comic Sans MS", "Marker Felt", "Segoe Print", monospace'; // Marker
                    }
                },
                'font-size': '15px',
                'shadow-blur': 12,
                'shadow-color': '#000000',
                'shadow-opacity': 0.25,
                'shadow-offset-x': 4,
                'shadow-offset-y': 4,
                'z-index': 100
            })
            .selector('.annotation-edge').style({
                'line-style': 'dashed',
                'line-color': '#fbc02d',
                'width': 2,
                'line-opacity': 0.6,
                'target-arrow-shape': 'none',
                'curve-style': 'unbundled-bezier',
                'control-point-distances': 35,
                'control-point-weights': 0.5,
                'z-index': 1
            }).update();
    }
}