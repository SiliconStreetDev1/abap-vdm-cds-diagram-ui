/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Event handler registry for Cytoscape.js.
 * @description Binds user interaction events (click, double click, selection) on the graph to Fiori UI dispatchers.
 */
import type { Core, NodeSingular, EventObject } from "cytoscape";
import { DomEvents } from "../../../constants/EventConstants";

export default class CytoscapeEventHandler {

    /**
     * @public
     * @static
     * @description Attaches standard interaction events to the given Cytoscape instance.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {boolean} bIsDrillDown - Whether the current canvas is in a read-only drill down state.
     * @returns {void}
     */
    public static attachEvents(sViewId: string, cyInstance: Core, bIsDrillDown: boolean, bIsViewerMode: boolean = false): void {
        this._attachLayoutEvents(sViewId, cyInstance);
        this._attachSelectionEvents(sViewId, cyInstance);
        this._attachInteractionEvents(sViewId, cyInstance, bIsDrillDown, bIsViewerMode);
        this._attachDragEvents(sViewId, cyInstance);
    }

    /**
     * @private
     * @static
     * @description Attaches graph selection and focus mode events.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     */
    private static _attachSelectionEvents(sViewId: string, cyInstance: Core): void {
        // Track Box Selection state to prevent Focus Mode from triggering during Marquee lassoing
        cyInstance.on('boxstart', () => cyInstance.scratch('_isBoxSelecting', true));
        cyInstance.on('boxend', () => requestAnimationFrame(() => {
            if (cyInstance && !cyInstance.destroyed()) {
                cyInstance.scratch('_isBoxSelecting', false);
            }
        }));

        // Track modifier keys during tap to prevent Focus Mode from triggering on Ctrl+Click
        cyInstance.on('tapstart', (evt: EventObject) => {
            const bIsMulti = evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey || evt.originalEvent.shiftKey);
            cyInstance.scratch('_isMultiSelectModifier', !!bIsMulti);
        });
        cyInstance.on('tapend', () => requestAnimationFrame(() => {
            if (cyInstance && !cyInstance.destroyed()) {
                cyInstance.scratch('_isMultiSelectModifier', false);
            }
        }));

        cyInstance.on('select unselect', (evt: EventObject) => {
            const selected = cyInstance.elements('node:selected');
            
            cyInstance.elements().removeClass('faded highlighted');
            
            let bFocus = false;
            let sFocusName = "";
            
            // Detect if the user is holding a modifier key to perform a multi-select operation
            const bIsMultiSelectModifier = cyInstance.scratch('_isMultiSelectModifier') || (evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey || evt.originalEvent.shiftKey));
            
            // Detect if the selection was triggered via Marquee Box Selection
            const bIsBoxSelecting = cyInstance.scratch('_isBoxSelecting');

            // Enterprise UX: Focus Mode is strictly for single-entity discovery.
            // If > 1 node is selected (Mass Selection), we instantly abort the fade to retain full visual context.
            // We also suppress focus if a modifier key is held, or if the user is actively using the box selection tool.
            const bHasSingleNode = selected.length === 1 && !selected.hasClass('annotation-note');
            
            if (!bHasSingleNode && !cyInstance.scratch('_ignoreTempFocusWipe')) {
                cyInstance.scratch('_tempFocusMode', false);
            }
            
            const bFocusModeEnabled = cyInstance.scratch('_enableFocusMode') || cyInstance.scratch('_tempFocusMode');
            
            if (bFocusModeEnabled && bHasSingleNode && !bIsMultiSelectModifier && !bIsBoxSelecting) {
                const neighborhood = selected.closedNeighborhood();
                cyInstance.elements().difference(neighborhood).addClass('faded');
                neighborhood.addClass('highlighted');
                
                bFocus = true;
                sFocusName = selected[0].data('label') || selected[0].id();
            }
            
            if (typeof document !== "undefined") {
                document.dispatchEvent(new CustomEvent(DomEvents.FOCUS_MODE_CHANGED, { 
                    detail: { viewId: sViewId, isFocused: bFocus, nodeName: sFocusName, hasNodeSelected: bHasSingleNode, tempFocusMode: cyInstance.scratch('_tempFocusMode') || false } 
                }));
            }
        });
    }

    /**
     * @private
     * @static
     * @description Attaches click and double-click interaction events.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {boolean} bIsDrillDown - Whether the current canvas is in a read-only drill down state.
     */
    private static _attachInteractionEvents(sViewId: string, cyInstance: Core, bIsDrillDown: boolean, bIsViewerMode: boolean): void {

        // Enterprise UX: Clicking the background canvas instantly drops any active selections
        cyInstance.on('tap', (evt: EventObject) => {
            if (evt.target === cyInstance) {
                cyInstance.elements().unselect();
            }
        });

        cyInstance.on('select', 'node', (evt: EventObject) => {
            evt.target.data('_lastSelectTime', Date.now());
        });

        cyInstance.on('tap', 'node', (evt: EventObject) => {
            const node = evt.target as NodeSingular;
            const now = Date.now();
            const lastTap = node.data('_lastTapTime') || 0;
            const timeDiff = now - lastTap;
            node.data('_lastTapTime', now);

            if (timeDiff > 0 && timeDiff < 400) {
                if (node.hasClass('annotation-note')) {
                    if (!bIsDrillDown && !bIsViewerMode) {
                        if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.PROMPT_EDIT_NOTE_REQUEST, { detail: { viewId: sViewId, id: node.id(), text: node.data('label'), fontFamily: node.data('fontFamily') } }));
                    }
                    return;
                }
                
                if (bIsViewerMode) return; // Completely enforce read-only presentation lockdown
                
                document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRILL_DOWN, { detail: { viewId: sViewId, viewName: node.data('id') } }));
                return;
            }
            
            const bIsMulti = evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey || evt.originalEvent.shiftKey);
            
            // Enterprise UX Toggle-Click: If holding a modifier key to multi-select, 
            // clicking an already-selected node should manually unselect it.
            if (bIsMulti && node.selected() && now - (node.data('_lastSelectTime') || 0) > 250) {
                node.unselect();
            }
            
            document.dispatchEvent(new CustomEvent(DomEvents.NODE_CLICKED, { detail: { viewId: sViewId, viewName: node.data('id') } }));
        });

        cyInstance.on('closeMinimap', () => {
            document.dispatchEvent(new CustomEvent(DomEvents.CLOSE_MINIMAP, { detail: { viewId: sViewId } }));
        });
    }

    /**
     * @private
     * @static
     * @description Attaches node drag and drop events, including linked sticky note physics.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     */
    private static _attachDragEvents(sViewId: string, cyInstance: Core): void {

        cyInstance.on('grab', 'node:not(.annotation-note)', (evt: EventObject) => {
            const node = evt.target as NodeSingular;
            node.scratch('_dragPos', { ...node.position() });
        });

        cyInstance.on('drag', 'node', (evt: EventObject) => {
            const node = evt.target as NodeSingular;
            
            // Enterprise UX: Move linked sticky notes automatically with the entity
            if (!node.hasClass('annotation-note')) {
                const prevPos = node.scratch('_dragPos');
                const currPos = node.position();

                if (prevPos) {
                    const dx = currPos.x - prevPos.x;
                    const dy = currPos.y - prevPos.y;

                    node.connectedEdges('.annotation-edge').connectedNodes('.annotation-note:unselected').forEach((note: NodeSingular) => {
                        // Prevent double-moving if a note is linked to multiple actively dragged entities
                        if (note.scratch('_lastDragTime') !== evt.timeStamp) {
                            note.position({ x: note.position('x') + dx, y: note.position('y') + dy });
                            note.scratch('_lastDragTime', evt.timeStamp);
                        }
                    });
                    
                    node.scratch('_dragPos', { ...currPos });
                }
            }

            document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, { detail: { viewId: sViewId } }));
        });
    }

    /**
     * @private
     * @static
     * @description Attaches layout and viewport transformation events.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     */
    private static _attachLayoutEvents(sViewId: string, cyInstance: Core): void {
        cyInstance.on('layoutstart', () => cyInstance.scratch('_isLayoutActive', true));
        
        cyInstance.on('layoutstop', () => requestAnimationFrame(() => {
            if (cyInstance && !cyInstance.destroyed()) {
                cyInstance.scratch('_isLayoutActive', false);
                if (typeof document !== "undefined") {
                    document.dispatchEvent(new CustomEvent(DomEvents.CANVAS_READY, { detail: { viewId: sViewId } }));
                }
            }
        }));
    }

    /**
     * @public
     * @static
     * @description Attaches custom snap-to-grid logic. This ensures the top-left corner 
     * of dynamically sized nodes aligns perfectly with the visual grid, overriding 
     * the extension's default center-snapping behavior.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {() => boolean} fnIsSnapEnabled - Callback to check if snapping is currently active in the UI.
     * @returns {void}
     */
    public static attachGridSnapEvent(cyInstance: Core, fnIsSnapEnabled: () => boolean): void {
        const GRID_SIZE = 50; // Hardcoded visual grid step size

        cyInstance.on('free', 'node', (evt: EventObject) => {
            if (!fnIsSnapEnabled()) return;
            
            const node = evt.target as NodeSingular;
            const boundingBox = node.boundingBox();
            
            // Calculate the delta required to lock the top-left corner (x1, y1) to the nearest 50px grid intersection
            const deltaX = (Math.round(boundingBox.x1 / GRID_SIZE) * GRID_SIZE) - boundingBox.x1;
            const deltaY = (Math.round(boundingBox.y1 / GRID_SIZE) * GRID_SIZE) - boundingBox.y1;
            
            // Apply the offset to the node's core center position
            node.position({ 
                x: node.position('x') + deltaX, 
                y: node.position('y') + deltaY 
            });
        });
    }
}