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
import { IParsedCytoscapeConfig } from "./cytoscape/CytoscapeConfigParser";
import CytoscapeStyleBuilder from "./cytoscape/CytoscapeStyleBuilder";
import CytoscapeLayoutBuilder from "./cytoscape/CytoscapeLayoutBuilder";
import CytoscapeDataProcessor from "./cytoscape/CytoscapeDataProcessor";
import CytoscapeExporter from "./cytoscape/CytoscapeExporter";
import CytoscapeSearchManager from "./cytoscape/CytoscapeSearchManager";
import CytoscapeEventHandler from "./cytoscape/CytoscapeEventHandler";
import CytoscapeDependencyLoader from "./cytoscape/CytoscapeDependencyLoader";
import CytoscapeLayoutManager from "./cytoscape/CytoscapeLayoutManager";
import CytoscapeContextMenu from "./cytoscape/CytoscapeContextMenu";
import CytoscapeStateManager from "./cytoscape/CytoscapeStateManager";
import CytoscapeVisibilityManager from "./cytoscape/CytoscapeVisibilityManager";
import CytoscapeInteractionManager from "./cytoscape/CytoscapeInteractionManager";
import { EventManager } from "../../events/EventManager";
import type { Core } from "cytoscape";

declare const cytoscape: any;

export default class CytoscapeEngine {

    /**
     * @private
     * @description Groups the Cytoscape instance and its specific state rules 
     * together into a single contextual map to prevent disconnected memory references.
     */
    private static _cyContexts: Map<string, { cy: Core, layout: string, snapGuides: boolean, isViewerMode: boolean, isDrillDown: boolean }> = new Map();

    public static configPath = "/formatCytoscape";
    public static supportsLiveUpdate = true;
    public static supportsStateCapture = true;
    public static supportsMinimap = true;
    public static supportsSearch = true;
    public static supportsSourceExport = false;
    public static supportsImageExport = true;

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
     * @static
     * @description Provides the baseline default configuration for the UI Model.
     */
    public static getDefaultConfig(): Record<string, any> {
        return { layout_algorithm: "dagre", rank_dir: "TB", theme: "fiori_light", line_style: "bezier", animate: true, node_spacing: 125, snapGuides: false, enableFocusMode: false };
    }

    public static applyStateToConfig(oConfig: Record<string, any>, oState: any): Record<string, any> {
        const oFormatCy = Object.assign({}, oConfig);
        oFormatCy.presetPositions = oState || null;
        if (oState) {
            oFormatCy.layout_algorithm = "preset";
        }
        return oFormatCy;
    }

    public static extractStateForVariant(oConfig: Record<string, any>, oCanvasState: any, bSavePositions: boolean): Record<string, any> {
        const oFormatCy = Object.assign({}, oConfig);
        if (bSavePositions) {
            oFormatCy.presetPositions = oCanvasState;
        } else {
            oFormatCy.presetPositions = null; // Prevent ghost coordinates from saving
            if (oFormatCy.layout_algorithm === "preset") {
                oFormatCy.layout_algorithm = "dagre"; // ENTERPRISE FIX: Reset layout if positions are explicitly dropped
            }
        }
        return oFormatCy;
    }

    /**
     * @public
     * @static
     * @description Formats the raw UI configuration for the backend payload.
     */
    public static formatBackendConfig(oRawConfig: Record<string, any>): Record<string, any> {
        const oFormatConfig = Object.assign({}, oRawConfig);
        // ARCHITECTURE FIX: Strip heavy frontend-only data (like massive X/Y coordinate dictionaries)
        // to ensure the OData GET URL string remains tiny and never hits the 2048-character limit.
        delete oFormatConfig.presetPositions;
        return oFormatConfig;
    }

    /**
     * @public
     * @description Initializes and renders the Cytoscape graph inside the target DOM container.
     * Fetches dependencies using local-first/CDN-fallback strategies before execution.
     * @param {string} sPayload - The JSON payload containing nodes, edges, and config.
     * @param {string} sRenderId - The DOM element ID where the canvas will be injected.
     * @param {function} fnOnError - Callback function to handle rendering errors.
     * @param {Record<string, any>} [oConfig] - Cytoscape formatting config
     */
    public static render(sViewId: string, sPayload: string, sRenderId: string, fnOnError: (msg: string) => void, oConfig?: Record<string, any>): void {
        CytoscapeDependencyLoader.load().then(() => {
                try {
                    const oData = JSON.parse(sPayload);
                    
                    // Fiori UI binds to formatCytoscape. Fallback to format for legacy payloads.
                    const oFormat = oConfig || oData.config?.formatCytoscape || oData.config?.format || {};
                    const parsedConfig = CytoscapeConfigParser.parse(oFormat);
                    
                    const iNodeCount = oData.nodes ? oData.nodes.length : 0;

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
                        userPanningEnabled: true, // Syncs with Fiori View Model default (Pan Mode)
                        boxSelectionEnabled: !parsedConfig.isViewerMode,
                        autoungrabify: false, 
                        selectionType: 'single'
                    });
                    
                    this._cyContexts.set(sViewId, {
                        cy: cyInstance,
                        layout: parsedConfig.layout,
                        snapGuides: parsedConfig.snapGuides,
                        isViewerMode: !!parsedConfig.isViewerMode,
                        isDrillDown: !!parsedConfig.isDrillDown
                    });
                    cyInstance.scratch('_enableFocusMode', !!oFormat.enableFocusMode);

                    // Inject visual styling for Sticky Notes and Edges
                    CytoscapeStyleBuilder.injectAnnotationStyles(cyInstance);

                    CytoscapeLayoutManager.applyGridGuide(cyInstance, parsedConfig);
                    
                    CytoscapeEventHandler.attachEvents(sViewId, cyInstance, () => this._cyContexts.get(sViewId)?.isDrillDown || false, () => this._cyContexts.get(sViewId)?.isViewerMode || false);
                    CytoscapeEventHandler.attachGridSnapEvent(cyInstance, () => this._cyContexts.get(sViewId)?.snapGuides || false);
                    CytoscapeContextMenu.attach(sViewId, cyInstance, () => this._cyContexts.get(sViewId)?.isDrillDown || false, () => this._cyContexts.get(sViewId)?.isViewerMode || false);

                    MinimapManager.toggle(sViewId, cyInstance, MinimapManager.getShowState(sViewId));

                    // ENTERPRISE FIX: Trigger the layout engine AFTER event handlers are bound so UndoHandler catches CANVAS_READY
                    CytoscapeLayoutManager.applyHybridLayout(sViewId, cyInstance, parsedConfig, iNodeCount);

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
     * @param {Record<string, any>} oConfig - The updated formatting configuration.
     */
    public static updateFormat(sViewId: string, oConfig: Record<string, any>): void {
        const context = this._cyContexts.get(sViewId);
        if (context) {
            const cyInstance = context.cy;
            const parsedConfig = CytoscapeConfigParser.parse(oConfig);
            const iNodeCount = cyInstance.nodes().length;
            
            const bIsLayoutChange = parsedConfig.layout !== context.layout;
            context.layout = parsedConfig.layout;
            context.snapGuides = parsedConfig.snapGuides;
            context.isViewerMode = !!parsedConfig.isViewerMode;
            context.isDrillDown = !!parsedConfig.isDrillDown;
            
            const bFocusModeChanged = cyInstance.scratch('_enableFocusMode') !== !!oConfig.enableFocusMode;
            cyInstance.scratch('_enableFocusMode', !!oConfig.enableFocusMode);
            
            const oContainer = cyInstance.container();
            if (oContainer) {
                oContainer.style.backgroundColor = parsedConfig.theme === 'fiori_dark' ? '#29313a' : 'var(--sapBackgroundColor, #ffffff)';
            }
            
            if (bIsLayoutChange) {
                cyInstance.nodes().unlock();
            }

            // 1. Update visual styles dynamically
            cyInstance.style(CytoscapeStyleBuilder.build(parsedConfig));
            
            // 2. Update Alignment Guides dynamically
            CytoscapeLayoutManager.applyGridGuide(cyInstance, parsedConfig);

            // 3. Re-inject visual styling for Sticky Notes so they survive format updates
            CytoscapeStyleBuilder.injectAnnotationStyles(cyInstance);

            // 4. Rerun the physical layout using the centralized hybrid rules
            CytoscapeLayoutManager.applyHybridLayout(sViewId, cyInstance, parsedConfig, iNodeCount);

            // 5. Re-evaluate focus mode if toggled dynamically
            if (bFocusModeChanged) {
                cyInstance.scratch('_tempFocusMode', false);
                const selected = cyInstance.elements('node:selected');
                if (selected.length > 0) {
                    cyInstance.scratch('_ignoreTempFocusWipe', true);
                    cyInstance.elements().unselect();
                    selected.select(); // Trigger the event handler to apply/remove classes
                    cyInstance.scratch('_ignoreTempFocusWipe', false);
                } else {
                    cyInstance.elements().removeClass('faded highlighted');
                    EventManager.getInstance().publish("canvas:focusModeChanged", { viewId: sViewId, isFocused: false, nodeName: "", hasNodeSelected: false, tempFocusMode: false });
                }
            }
        }
    }

    /**
     * @public
     * @static
     * @description Applies a temporary neighborhood highlight around the current selection.
     */
    public static setTempFocusMode(sViewId: string, bEnable: boolean): void {
        const context = this._cyContexts.get(sViewId);
        if (context) {
            const cyInstance = context.cy;
            cyInstance.scratch('_tempFocusMode', bEnable);
            
            const selected = cyInstance.elements('node:selected');
            if (selected.length > 0) {
                cyInstance.scratch('_ignoreTempFocusWipe', true);
                cyInstance.elements().unselect();
                selected.select(); 
                cyInstance.scratch('_ignoreTempFocusWipe', false);
            }
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
        const context = this._cyContexts.get(sViewId);
        if (context) CytoscapeInteractionManager.setInteractionMode(context.cy, sMode);
    }

    /**
     * @public
     * @description Drops all active selections from the graph.
     */
    public static clearSelection(sViewId: string): void {
        const context = this._cyContexts.get(sViewId);
        if (context) CytoscapeInteractionManager.clearSelection(context.cy);
    }

    /**
     * @public
     * @description Selects all visible nodes on the graph.
     */
    public static selectAll(sViewId: string): void {
        const context = this._cyContexts.get(sViewId);
        if (context) CytoscapeInteractionManager.selectAll(context.cy);
    }

    /**
     * @public
     * @description Deletes selected sticky notes and hides selected diagram entities.
     */
    public static deleteSelection(sViewId: string): void {
        const context = this._cyContexts.get(sViewId);
        if (!context) return;
        
        const cyInstance = context.cy;
        const selected = cyInstance.nodes(':selected');
        if (selected.length === 0) return;

        const notes = selected.filter('.annotation-note');
        const entities = selected.difference('.annotation-note');
        
        let bChanged = false;

        if (notes.length > 0) {
            cyInstance.remove(notes);
            bChanged = true;
        }

        if (entities.length > 0) {
            entities.addClass('hidden');
            entities.unselect();
            bChanged = true;
            
            // Ensure Fiori UI 'Hidden Entities' list syncs up
            const hiddenNodes = cyInstance.nodes('.hidden').map((n: any) => ({
                id: n.id(),
                label: n.data('label') || n.id()
            }));
            EventManager.getInstance().publish("canvas:nodesVisibilityChanged", {
                viewId: sViewId, hasHidden: hiddenNodes.length > 0, hiddenNodes: hiddenNodes
            });
        }

        // Commit changes to the Ctrl+Z Undo Stack
        if (bChanged) {
            EventManager.getInstance().publish("canvas:nodeHidden", { viewId: sViewId });
        }
    }

    /**
     * @public
     * @description Toggles the visibility of the Cytoscape minimap (Bird's Eye View).
     * @param {boolean} bShow - True to enable the minimap, false to destroy it.
     */
    public static toggleMinimap(sViewId: string, bShow: boolean): void {
        const context = this._cyContexts.get(sViewId);
        MinimapManager.toggle(sViewId, context?.cy, bShow);
    }

    /**
     * @public
     * @description Destroys the active Cytoscape instance and cleans up memory.
     */
    public static destroy(sViewId: string): void {
        const context = this._cyContexts.get(sViewId);
        if (context) {
            MinimapManager.destroy(sViewId);
            CytoscapeContextMenu.removeAll(sViewId);
            context.cy.destroy();
            this._cyContexts.delete(sViewId);
        }
    }

    /**
     * @public
     * @description Exports the current canvas view as a base64 encoded PNG string.
     * @returns {string} Base64 PNG data URI.
     */
    public static exportPng(sViewId: string): string {
        const context = this._cyContexts.get(sViewId);
        return context ? CytoscapeExporter.exportPng(context.cy) : "";
    }

    /**
     * @public
     * @description Exports the current canvas view as a zoomable, centered SVG string.
     * Applies internal CSS for centering while retaining physical dimensions to enable browser scroll-to-zoom.
     * @returns {string} Formatted SVG XML string.
     */
    public static exportSvg(sPayload: string, sViewId?: string): string {
        const context = sViewId ? this._cyContexts.get(sViewId) : undefined;
        return context ? CytoscapeExporter.exportSvg(context.cy) : "";
    }

    /**
     * @public
     * @description Searches for nodes matching the query and focuses the camera on them.
     * @param {string} sQuery - The text to search for
     */
    public static search(sViewId: string, sQuery: string): void {
        const context = this._cyContexts.get(sViewId);
        if (context) CytoscapeSearchManager.search(context.cy, sQuery);
    }

    /**
     * @public
     * @description Restores all hidden nodes to the canvas and notifies the UI.
     */
    public static showHiddenNodes(sViewId: string): void {
        const context = this._cyContexts.get(sViewId);
        if (context) CytoscapeVisibilityManager.showHiddenNodes(sViewId, context.cy);
    }

    /**
     * @public
     * @description Selectively restores specifically identified nodes to the canvas.
     * @param {string[]} aNodeIds - Array of internal node IDs to restore.
     */
    public static showSpecificNodes(sViewId: string, aNodeIds: string[]): void {
        const context = this._cyContexts.get(sViewId);
        if (context) CytoscapeVisibilityManager.showSpecificNodes(sViewId, context.cy, aNodeIds);
    }

    /**
     * @public
     * @description Returns the X/Y coordinates of all current nodes for variant persistence.
     */
    public static moveNode(sViewId: string, nodeId: string, position: {x: number, y: number}): void { const ctx = this._cyContexts.get(sViewId); if (ctx && ctx.cy) { ctx.cy.$("#" + nodeId.replace(/\./g, "\\.")).position(position); } }

    /**
     * @public
     * @static
     * @description Extracts the live X/Y canvas coordinates for layout persistence.
     */
    public static getCanvasState(sViewId: string): Record<string, any> {
        const context = this._cyContexts.get(sViewId);
        return context ? CytoscapeStateManager.getCanvasState(context.cy) : {};
    }

    /**
     * @public
     * @static
     * @description Add a new sticky note to the graph.
     */
    public static addNote(sViewId: string, sText: string, sFontFamily: string): void {
        const context = this._cyContexts.get(sViewId);
        if (!context || !context.cy) return;
        const cyInstance = context.cy;

        const sId = "note_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
        let iX = 0, iY = 0;
        const aSelectedEntities = cyInstance.nodes(':selected').difference('.annotation-note');

        if (aSelectedEntities.length > 0) {
            const oTargetPos = aSelectedEntities[0].position();
            iX = oTargetPos.x + 150;
            iY = oTargetPos.y - 100;
        } else {
            const oExtent = cyInstance.extent();
            const iCenterX = oExtent.x1 + (oExtent.w / 2);
            const iCenterY = oExtent.y1 + (oExtent.h / 2);
            
            const aExistingBoxes = cyInstance.nodes().map((n: any) => n.boundingBox());

            let iRadius = 0;
            let iAngle = 0;
            let bFoundEmpty = false;
            
            while (!bFoundEmpty && iRadius < 3000) {
                iX = iCenterX + iRadius * Math.cos(iAngle);
                iY = iCenterY + iRadius * Math.sin(iAngle);
                
                const bOverlaps = aExistingBoxes.some((oBox: any) => {
                    return !(iX + 90 < oBox.x1 || iX - 90 > oBox.x2 || iY + 50 < oBox.y1 || iY - 50 > oBox.y2);
                });
                
                if (!bOverlaps) bFoundEmpty = true;
                else {
                    iAngle += 0.5;
                    iRadius += 20;
                }
            }
        }

        cyInstance.add({
            group: 'nodes',
            data: { id: sId, label: sText, fontFamily: sFontFamily || "Marker", bgColor: '#fff9c4', borderColor: '#fbc02d', isNote: true },
            classes: 'annotation-note',
            position: { x: iX, y: iY }
        });

        if (aSelectedEntities.length > 0) {
            aSelectedEntities.forEach((oEntity: any) => {
                cyInstance.add({
                    group: 'edges',
                    data: { id: 'edge_' + sId + '_' + oEntity.id(), source: sId, target: oEntity.id() },
                    classes: 'annotation-edge'
                });
            });
        }
    }

    /**
     * @public
     * @static
     * @description Edit an existing sticky note.
     */
    public static editNote(sViewId: string, sNoteId: string, sText: string, sFontFamily?: string): void {
        const context = this._cyContexts.get(sViewId);
        if (!context || !context.cy) return;
        const oNode = context.cy.getElementById(sNoteId);
        if (oNode.length > 0) {
            oNode.data('label', sText);
            if (sFontFamily) oNode.data('fontFamily', sFontFamily);
        }
    }

    /**
     * @public
     * @static
     * @description Change the color of an existing sticky note.
     */
    public static changeNoteColor(sViewId: string, sNoteId: string, sBgColor: string, sBorderColor: string): void {
        const context = this._cyContexts.get(sViewId);
        if (!context || !context.cy) return;
        const oNode = context.cy.getElementById(sNoteId);
        if (oNode.length > 0) {
            oNode.data('bgColor', sBgColor);
            oNode.data('borderColor', sBorderColor);
        }
    }
}