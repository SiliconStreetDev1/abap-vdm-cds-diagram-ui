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
import EffectsManager from "./cytoscape/plugins/effects/EffectsManager";
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
import { EngineType } from "../../types";
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
    public static isAsynchronousRenderer = true;
    public static supportsInteractiveMode = true;
    public static supportsAdvancedFormatting = true;

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
     * @description Exposes available gamification plugins from the EffectsManager.
     */
    public static getAvailableEffects(): { id: string; name: string; enabled: boolean }[] {
        return EffectsManager.getInstance().getRegisteredPlugins();
    }

    /**
     * @public
     * @description Toggles specific plugins on or off at runtime.
     */
    public static toggleEffect(effectId: string, enabled: boolean): void {
        EffectsManager.getInstance().togglePlugin(effectId, enabled);
    }

    /**
     * @public
     * @static
     * @description Provides the baseline default configuration for the UI Model.
     */
    public static getDefaultConfig(): Record<string, any> {
        return { layout_algorithm: "dagre", rank_dir: "TB", theme: "fiori_light", line_style: "bezier", animate: true, node_spacing: 125, snapGuides: false, enableFocumode: false, autoScale: true };
    }

    public static applyStateToConfig(config: Record<string, any>, state: any): Record<string, any> {
        const formatCy = Object.assign({}, config);
        formatCy.presetPositions = state || null;
        if (state) {
            formatCy.layout_algorithm = "preset";
        }
        return formatCy;
    }

    public static extractStateForVariant(config: Record<string, any>, canvasState: any, savePositions: boolean): Record<string, any> {
        const formatCy = Object.assign({}, config);
        if (savePositions) {
            formatCy.presetPositions = canvasState;
        } else {
            formatCy.presetPositions = null; // Prevent ghost coordinates from saving
            if (formatCy.layout_algorithm === "preset") {
                formatCy.layout_algorithm = "dagre"; // ENTERPRISE FIX: Reset layout if positions are explicitly dropped
            }
        }
        return formatCy;
    }

    /**
     * @public
     * @static
     * @description Formats the raw UI configuration for the backend payload.
     */
    public static formatBackendConfig(rawConfig: Record<string, any>): Record<string, any> {
        const formatConfig = Object.assign({}, rawConfig);
        // ARCHITECTURE FIX: Strip heavy frontend-only data (like massive X/Y coordinate dictionaries)
        // to ensure the OData GET URL string remains tiny and never hits the 2048-character limit.
        delete formatConfig.presetPositions;
        return formatConfig;
    }

    /**
     * @public
     * @description Initializes and renders the Cytoscape graph inside the target DOM container.
     * Fetches dependencies using local-first/CDN-fallback strategies before execution.
     * @param {string} payload - The JSON payload containing nodes, edges, and config.
     * @param {string} renderId - The DOM element ID where the canvas will be injected.
     * @param {function} onError - Callback function to handle rendering errors.
     * @param {Record<string, any>} [config] - Cytoscape formatting config
     */
    public static render(viewId: string, payload: string, renderId: string, onError: (msg: string) => void, config?: Record<string, any>): void {
        CytoscapeDependencyLoader.load().then(() => {
                try {
                    const oData = JSON.parse(payload);
                    
                    // Fiori UI binds to formatCytoscape. Fallback to format for legacy payloads.
                    const format = config || oData.config?.formatCytoscape || oData.config?.format || {};
                    const parsedConfig = CytoscapeConfigParser.parse(format);
                    
                    const iNodeCount = oData.nodes ? oData.nodes.length : 0;

                    const oContainer = document.getElementById(renderId);
                    if (!oContainer) {
                        onError("Cytoscape Render Error: Target DOM container not found.");
                        return;
                    }

                // Ensure container has an explicit background to prevent black screen in native fullscreen mode
                oContainer.style.backgroundColor = parsedConfig.theme === 'fiori_dark' ? '#29313a' : 'var(--sapBackgroundColor, #ffffff)';

                    // Destroy existing instance to prevent memory leaks and duplicate canvases
                    this.destroy(viewId);

                    // Unpack Arrays and format Labels for display
                    CytoscapeDataProcessor.process(oData.nodes || [], oData.edges || []);

                    // Prevent Cytoscape crash from invalid edges
                    if (oData.nodes && oData.edges) {
                        const nodeIds = new Set(oData.nodes.map((n: any) => n.data.id));
                        oData.edges = oData.edges.filter((e: any) => nodeIds.has(e.data.source) && nodeIds.has(e.data.target));
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
                    
                    this._cyContexts.set(viewId, {
                        cy: cyInstance,
                        layout: parsedConfig.layout,
                        snapGuides: parsedConfig.snapGuides,
                        isViewerMode: !!parsedConfig.isViewerMode,
                        isDrillDown: !!parsedConfig.isDrillDown
                    });
                    cyInstance.scratch('_enableFocumode', !!format.enableFocumode);

                    // Inject visual styling for Sticky Notes and Edges
                    CytoscapeStyleBuilder.injectAnnotationStyles(cyInstance);

                    CytoscapeLayoutManager.applyGridGuide(cyInstance, parsedConfig);
                    
                    CytoscapeEventHandler.attachEvents(viewId, cyInstance, () => this._cyContexts.get(viewId)?.isDrillDown || false, () => this._cyContexts.get(viewId)?.isViewerMode || false);
                    CytoscapeEventHandler.attachGridSnapEvent(cyInstance, () => this._cyContexts.get(viewId)?.snapGuides || false);
                    CytoscapeContextMenu.attach(viewId, cyInstance, () => this._cyContexts.get(viewId)?.isDrillDown || false, () => this._cyContexts.get(viewId)?.isViewerMode || false);

                    EffectsManager.getInstance().attachEvents(cyInstance);

                    MinimapManager.toggle(viewId, cyInstance, MinimapManager.getShowState(viewId));

                    // ENTERPRISE FIX: Trigger the layout engine AFTER event handlers are bound so UndoHandler catches CANVAS_READY
                    CytoscapeLayoutManager.applyHybridLayout(viewId, cyInstance, parsedConfig, iNodeCount);

                } catch (e: any) {
                    onError(`Cytoscape Parsing Error. Details: ${e.message}`);
                }
            }).catch((oNetworkError: any) => {
                onError(`Cytoscape Loading Error: ${oNetworkError.message || oNetworkError}`);
            });
    }

    /**
     * @public
     * @static
     * @description Dynamically updates the active Cytoscape instance with new layout and style configurations without a full re-render.
     * @param {Record<string, any>} config - The updated formatting configuration.
     */
    public static updateFormat(viewId: string, config: Record<string, any>): void {
        const context = this._cyContexts.get(viewId);
        if (context) {
            const cyInstance = context.cy;
            const parsedConfig = CytoscapeConfigParser.parse(config);
            const iNodeCount = cyInstance.nodes().length;
            
            const bIsLayoutChange = parsedConfig.layout !== context.layout;
            context.layout = parsedConfig.layout;
            context.snapGuides = parsedConfig.snapGuides;
            context.isViewerMode = !!parsedConfig.isViewerMode;
            context.isDrillDown = !!parsedConfig.isDrillDown;
            
            const bFocumodeChanged = cyInstance.scratch('_enableFocumode') !== !!config.enableFocumode;
            cyInstance.scratch('_enableFocumode', !!config.enableFocumode);
            
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
            CytoscapeLayoutManager.applyHybridLayout(viewId, cyInstance, parsedConfig, iNodeCount);

            // 5. Re-evaluate focus mode if toggled dynamically
            if (bFocumodeChanged) {
                cyInstance.scratch('_tempFocusMode', false);
                const selected = cyInstance.elements('node:selected');
                if (selected.length > 0) {
                    cyInstance.scratch('_ignoreTempFocusWipe', true);
                    cyInstance.elements().unselect();
                    selected.select(); // Trigger the event handler to apply/remove classes
                    cyInstance.scratch('_ignoreTempFocusWipe', false);
                } else {
                    cyInstance.elements().removeClass('faded highlighted');
                    EventManager.getInstance().publish("canvas:focusModeChanged", { viewId: viewId, isFocused: false, nodeName: "", hasNodeSelected: false, tempFocusMode: false });
                }
            }
        }
    }

    /**
     * @public
     * @static
     * @description Applies a temporary neighborhood highlight around the current selection.
     */
    public static setTempFocusMode(viewId: string, enable: boolean): void {
        const context = this._cyContexts.get(viewId);
        if (context) {
            const cyInstance = context.cy;
            cyInstance.scratch('_tempFocusMode', enable);
            
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
     * @param {"pan" | "select"} mode - The desired mouse behavior mode.
     */
    public static setInteractionMode(viewId: string, mode: "pan" | "select"): void {
        const context = this._cyContexts.get(viewId);
        if (context) CytoscapeInteractionManager.setInteractionMode(context.cy, mode);
    }

    /**
     * @public
     * @description Drops all active selections from the graph.
     */
    public static clearSelection(viewId: string): void {
        const context = this._cyContexts.get(viewId);
        if (context) CytoscapeInteractionManager.clearSelection(context.cy);
    }

    /**
     * @public
     * @description Selects all visible nodes on the graph.
     */
    public static selectAll(viewId: string): void {
        const context = this._cyContexts.get(viewId);
        if (context) CytoscapeInteractionManager.selectAll(context.cy);
    }

    /**
     * @public
     * @description Deletes selected sticky notes and hides selected diagram entities.
     */
    public static deleteSelection(viewId: string): void {
        const context = this._cyContexts.get(viewId);
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
                viewId: viewId, hasHidden: hiddenNodes.length > 0, hiddenNodes: hiddenNodes
            });
        }

        // Commit changes to the Ctrl+Z Undo Stack
        if (bChanged) {
            const payload = {
                viewId: viewId,
                notesJson: notes.length > 0 ? notes.jsons() : null,
                hiddenNodeIds: entities.length > 0 ? entities.map((n: any) => n.id()) : [],
                engine: EngineType.CYTOSCAPE
            };
            EventManager.getInstance().publish("canvas:nodeHidden", payload);
        }
    }

    /**
     * @public
     * @description Deletes specific notes and hides specific entities for Redo.
     */
    public static deleteSpecificElements(viewId: string, notesJson: any, hiddenNodeIds: string[]): void {
        const context = this._cyContexts.get(viewId);
        if (!context) return;

        if (notesJson && notesJson.length > 0) {
            const noteIds = notesJson.map((n: any) => n.data.id);
            const selector = noteIds.map((id: string) => `#${id}`).join(', ');
            context.cy.remove(context.cy.nodes(selector));
        }

        if (hiddenNodeIds && hiddenNodeIds.length > 0) {
            const selector = hiddenNodeIds.map(id => `#${id}`).join(', ');
            const entities = context.cy.nodes(selector);
            entities.addClass('hidden');
            entities.unselect();
            
            const hiddenNodes = context.cy.nodes('.hidden').map((n: any) => ({
                id: n.id(),
                label: n.data('label') || n.id()
            }));
            EventManager.getInstance().publish("canvas:nodesVisibilityChanged", {
                viewId: viewId, hasHidden: hiddenNodes.length > 0, hiddenNodes: hiddenNodes
            });
        }
    }

    /**
     * @public
     * @description Restores previously deleted notes and unhides entities for Undo.
     */
    public static restoreSelection(viewId: string, notesJson: any, hiddenNodeIds: string[]): void {
        const context = this._cyContexts.get(viewId);
        if (!context) return;
        
        if (notesJson && notesJson.length > 0) {
            context.cy.add(notesJson);
        }
        
        if (hiddenNodeIds && hiddenNodeIds.length > 0) {
            const selector = hiddenNodeIds.map(id => `#${id}`).join(', ');
            const entities = context.cy.nodes(selector);
            entities.removeClass('hidden');
            
            const hiddenNodes = context.cy.nodes('.hidden').map((n: any) => ({
                id: n.id(),
                label: n.data('label') || n.id()
            }));
            EventManager.getInstance().publish("canvas:nodesVisibilityChanged", {
                viewId: viewId, hasHidden: hiddenNodes.length > 0, hiddenNodes: hiddenNodes
            });
        }
    }

    /**
     * @public
     * @description Toggles the visibility of the Cytoscape minimap (Bird's Eye View).
     * @param {boolean} show - True to enable the minimap, false to destroy it.
     */
    public static toggleMinimap(viewId: string, show: boolean): void {
        const context = this._cyContexts.get(viewId);
        MinimapManager.toggle(viewId, context?.cy, show);
    }

    /**
     * @public
     * @description Destroys the active Cytoscape instance and cleans up memory.
     */
    public static destroy(viewId: string): void {
        const context = this._cyContexts.get(viewId);
        if (context) {
            MinimapManager.destroy(viewId);
            CytoscapeContextMenu.removeAll(viewId);
            EffectsManager.getInstance().detachEvents();
            context.cy.destroy();
            this._cyContexts.delete(viewId);
        }
    }

    /**
     * @public
     * @description Exports the current canvas view as a base64 encoded PNG string.
     * @returns {string} Base64 PNG data URI.
     */
    public static exportPng(viewId: string): string {
        const context = this._cyContexts.get(viewId);
        return context ? CytoscapeExporter.exportPng(context.cy) : "";
    }

    /**
     * @public
     * @description Exports the current canvas view as a zoomable, centered SVG string.
     * Applies internal CSS for centering while retaining physical dimensions to enable browser scroll-to-zoom.
     * @returns {string} Formatted SVG XML string.
     */
    public static exportSvg(payload: string, viewId?: string): string {
        const context = viewId ? this._cyContexts.get(viewId) : undefined;
        return context ? CytoscapeExporter.exportSvg(context.cy) : "";
    }

    /**
     * @public
     * @description Searches for nodes matching the query and focuses the camera on them.
     * @param {string} query - The text to search for
     */
    public static search(viewId: string, query: string): void {
        const context = this._cyContexts.get(viewId);
        if (context) CytoscapeSearchManager.search(context.cy, query);
    }

    /**
     * @public
     * @description Restores all hidden nodes to the canvas and notifies the UI.
     */
    public static showHiddenNodes(viewId: string): void {
        const context = this._cyContexts.get(viewId);
        if (context) CytoscapeVisibilityManager.showHiddenNodes(viewId, context.cy);
    }

    /**
     * @public
     * @description Selectively restores specifically identified nodes to the canvas.
     * @param {string[]} nodeIds - Array of internal node IDs to restore.
     */
    public static showSpecificNodes(viewId: string, nodeIds: string[]): void {
        const context = this._cyContexts.get(viewId);
        if (context) CytoscapeVisibilityManager.showSpecificNodes(viewId, context.cy, nodeIds);
    }

    public static moveNode(viewId: string, nodeId: string, position: {x: number, y: number}): void { const ctx = this._cyContexts.get(viewId); if (ctx && ctx.cy) { ctx.cy.$("#" + nodeId.replace(/\./g, "\\.")).position(position); } }

    /**
     * @public
     * @description Bulk updates multiple node coordinates in a single batched DOM repaint to eliminate O(N) performance bottlenecks.
     */
    public static moveNodes(viewId: string, nodes: { nodeId: string; position: {x: number, y: number} }[]): void {
        const ctx = this._cyContexts.get(viewId);
        if (ctx && ctx.cy) {
            ctx.cy.batch(() => {
                nodes.forEach(n => {
                    ctx.cy.$("#" + n.nodeId.replace(/\./g, "\\.")).position(n.position);
                });
            });
        }
    }

    /**
     * @public
     * @static
     * @description Extracts the live X/Y canvas coordinates for layout persistence.
     */
    public static getCanvasState(viewId: string): Record<string, any> {
        const context = this._cyContexts.get(viewId);
        return context ? CytoscapeStateManager.getCanvasState(context.cy) : {};
    }

    /**
     * @public
     * @static
     * @description Add a new sticky note to the graph.
     */
    public static addNote(viewId: string, text: string, fontFamily: string): any {
        const context = this._cyContexts.get(viewId);
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

        const el = cyInstance.add({
            group: 'nodes',
            data: { id: sId, label: text, fontFamily: fontFamily || "Marker", bgColor: '#fff9c4', borderColor: '#fbc02d', isNote: true },
            classes: 'annotation-note',
            position: { x: iX, y: iY }
        });

        if (aSelectedEntities.length > 0) {
            cyInstance.add({
                group: 'edges',
                data: { id: `edge_${sId}`, source: aSelectedEntities[0].id(), target: sId },
                classes: 'annotation-edge'
            });
        }
        
        // Return JSON of all newly added elements so Undo commands can track them
        const newEles = cyInstance.collection().add(el);
        if (aSelectedEntities.length > 0) newEles.merge(cyInstance.getElementById(`edge_${sId}`));
        return newEles.jsons();
    }

    /**
     * @public
     * @static
     * @description Edit an existing sticky note.
     */
    public static editNote(viewId: string, noteId: string, text: string, fontFamily?: string): void {
        const context = this._cyContexts.get(viewId);
        if (!context || !context.cy) return;
        const oNode = context.cy.getElementById(noteId);
        if (oNode.length > 0) {
            oNode.data('label', text);
            if (fontFamily) oNode.data('fontFamily', fontFamily);
        }
    }

    /**
     * @public
     * @static
     * @description Change the color of an existing sticky note.
     */
    public static changeNoteColor(viewId: string, noteId: string, bgColor: string, borderColor: string): void {
        const context = this._cyContexts.get(viewId);
        if (!context || !context.cy) return;
        const oNode = context.cy.getElementById(noteId);
        if (oNode.length > 0) {
            oNode.data('bgColor', bgColor);
            oNode.data('borderColor', borderColor);
        }
    }
}