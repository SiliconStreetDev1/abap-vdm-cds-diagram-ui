/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Event handler registry for Cytoscape.js.
 * @description Binds user interaction events (click, double click, selection) on the graph to Fiori UI dispatchers.
 */
import type { Core, NodeSingular, EventObject } from "cytoscape";
import { EventManager } from "../../../events/EventManager";

export default class CytoscapeEventHandler {

    /**
     * @public
     * @static
     * @description Attaches standard interaction events to the given Cytoscape instance.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {() => boolean} getIsDrillDown - Callback to evaluate if the canvas is in a read-only drill down state.
     * @param {() => boolean} getIsViewerMode - Callback to evaluate if the canvas is in viewer mode.
     * @returns {void}
     */
    public static attachEvents(viewId: string, cyInstance: Core, getIsDrillDown: () => boolean, getIsViewerMode: () => boolean): void {
        this._attachLayoutEvents(viewId, cyInstance);
        this._attachSelectionEvents(viewId, cyInstance);
        this._attachInteractionEvents(viewId, cyInstance, getIsDrillDown, getIsViewerMode);
        this._attachDragEvents(viewId, cyInstance);
    }

    /**
     * @private
     * @static
     * @description Attaches graph selection and focus mode events.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     */
    private static _attachSelectionEvents(viewId: string, cyInstance: Core): void {
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
            
            const bFocumodeEnabled = cyInstance.scratch('_enableFocumode') || cyInstance.scratch('_tempFocusMode');
            
            if (bFocumodeEnabled && bHasSingleNode && !bIsMultiSelectModifier && !bIsBoxSelecting) {
                const neighborhood = selected.closedNeighborhood();
                cyInstance.elements().difference(neighborhood).addClass('faded');
                neighborhood.addClass('highlighted');
                
                bFocus = true;
                sFocusName = selected[0].data('label') || selected[0].id();
            }
            
            if (typeof document !== "undefined") {
                EventManager.getInstance().publish("canvas:focusModeChanged", { 
                    viewId: viewId, isFocused: bFocus, nodeName: sFocusName, hasNodeSelected: bHasSingleNode, tempFocusMode: cyInstance.scratch('_tempFocusMode') || false 
                });
            }
        });
    }

    /**
     * @private
     * @static
     * @description Attaches click and double-click interaction events.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {() => boolean} getIsDrillDown - Callback to evaluate if the current canvas is in a drill down state.
     * @param {() => boolean} getIsViewerMode - Callback to evaluate if the current canvas is in viewer mode.
     */
    private static _attachInteractionEvents(viewId: string, cyInstance: Core, getIsDrillDown: () => boolean, getIsViewerMode: () => boolean): void {

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
                    if (!getIsDrillDown() && !getIsViewerMode()) {
                        EventManager.getInstance().publish("canvas:promptEditNoteRequest", { viewId: viewId, noteId: node.id(), text: node.data('label'), fontFamily: node.data('fontFamily') });
                    }
                    return;
                }
                
                if (getIsViewerMode()) return; // Completely enforce read-only presentation lockdown
                
                EventManager.getInstance().publish("canvas:nodeDrillDownRequest", { viewId: viewId, viewName: node.data('id') });
                return;
            }
            
            const bIsMulti = evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey || evt.originalEvent.shiftKey);
            
            // Enterprise UX Toggle-Click: If holding a modifier key to multi-select, 
            // clicking an already-selected node should manually unselect it.
            if (bIsMulti && node.selected() && now - (node.data('_lastSelectTime') || 0) > 250) {
                node.unselect();
            }
            
            EventManager.getInstance().publish("canvas:nodeClicked", { viewId: viewId, nodeId: node.data('id') });
        });

        cyInstance.on('closeMinimap', () => {
            EventManager.getInstance().publish("canvas:closeMinimapRequest", { viewId: viewId });
        });
    }

    /**
     * @private
     * @static
     * @description Attaches node drag and drop events, including linked sticky note physics.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     */
    private static _attachDragEvents(viewId: string, cyInstance: Core): void {

        cyInstance.on('grab', 'node', (evt: EventObject) => {
            const node = evt.target as NodeSingular;
            const toTrack = node.selected() ? cyInstance.nodes(':selected').union(node) : cyInstance.collection().add(node);
            toTrack.forEach(n => { 
                n.scratch('_dragPos', { ...n.position() });
                n.scratch('_intersectedEdges', new Set<string>()); // Initialize physics tracking
                
                // Track initial positions for linked notes to prevent exponential delta compounding
                if (!n.hasClass('annotation-note')) {
                    n.connectedEdges('.annotation-edge').connectedNodes('.annotation-note:unselected').forEach((note: NodeSingular) => {
                        note.scratch('_noteDragPos', { ...note.position() });
                    });
                }
            });
        });

        cyInstance.on('drag', 'node', (evt: EventObject) => {
            const node = evt.target as NodeSingular;
            
            const prevPos = node.scratch('_dragPos');
            const currPos = node.position();
            
            // Enterprise UX: Move linked sticky notes automatically with the entity
            if (!node.hasClass('annotation-note')) {
                if (prevPos) {
                    const dx = currPos.x - prevPos.x;
                    const dy = currPos.y - prevPos.y;
                    node.connectedEdges('.annotation-edge').connectedNodes('.annotation-note:unselected').forEach((note: NodeSingular) => {
                        const initialNotePos = note.scratch('_noteDragPos');
                        if (initialNotePos && note.scratch('_lastDragTime') !== evt.timeStamp) {
                            note.position({ x: initialNotePos.x + dx, y: initialNotePos.y + dy });
                            note.scratch('_lastDragTime', evt.timeStamp);
                        }
                    });
                }
            }

            // Enterprise UX: Dispatch a high-frequency dragging event for real-time haptics/audio
            EventManager.getInstance().publish("canvas:nodeDragging", { viewId: viewId, nodeId: node.id(), position: { x: currPos.x, y: currPos.y } });

            // Acoustic Edge Plucking Physics
            // Calculate point-to-line-segment distance to detect if the node crosses a foreign edge
            const nodePos = node.position();
            const nodeRadius = (node.width() / 2) + 5; // Collision boundary
            
            const connectedEdges = node.connectedEdges();
            const foreignEdges = cyInstance.edges().difference(connectedEdges);
            
            const previouslyIntersected = node.scratch('_intersectedEdges') as Set<string> || new Set<string>();
            const currentlyIntersected = new Set<string>();
            let didPluck = false;

            foreignEdges.forEach(edge => {
                const src = edge.source().position();
                const tgt = edge.target().position();
                
                // Fast Euclidean distance to line segment
                const l2 = Math.pow(tgt.x - src.x, 2) + Math.pow(tgt.y - src.y, 2);
                let dist = 0;
                if (l2 === 0) {
                    dist = Math.sqrt(Math.pow(nodePos.x - src.x, 2) + Math.pow(nodePos.y - src.y, 2));
                } else {
                    let t = ((nodePos.x - src.x) * (tgt.x - src.x) + (nodePos.y - src.y) * (tgt.y - src.y)) / l2;
                    t = Math.max(0, Math.min(1, t));
                    dist = Math.sqrt(Math.pow(nodePos.x - (src.x + t * (tgt.x - src.x)), 2) + Math.pow(nodePos.y - (src.y + t * (tgt.y - src.y)), 2));
                }
                
                if (dist < nodeRadius) {
                    currentlyIntersected.add(edge.id());
                    if (!previouslyIntersected.has(edge.id())) {
                        didPluck = true;
                    }
                }
            });
            
            node.scratch('_intersectedEdges', currentlyIntersected);
            
            if (didPluck) {
                EventManager.getInstance().publish("canvas:edgePlucked", { viewId: viewId, nodeId: node.id() });
            }
        });
        
        cyInstance.on('free', 'node', (evt: EventObject) => {
            const node = evt.target as NodeSingular;
            const toCheck = node.selected() ? cyInstance.nodes(':selected').union(node) : cyInstance.collection().add(node);
            const changes: any[] = [];
            
            toCheck.forEach(n => {
                const prevPos = n.scratch('_dragPos');
                const currPos = n.position();
                if (prevPos && (prevPos.x !== currPos.x || prevPos.y !== currPos.y)) {
                    changes.push({
                        nodeId: n.id(),
                        oldPos: { ...prevPos },
                        newPos: { ...currPos }
                    });
                }
                n.removeScratch('_dragPos');
                n.removeScratch('_intersectedEdges');
                
                // Cleanup note drag tracking
                if (!n.hasClass('annotation-note')) {
                    n.connectedEdges('.annotation-edge').connectedNodes('.annotation-note').forEach((note: NodeSingular) => {
                        note.removeScratch('_noteDragPos');
                        note.removeScratch('_lastDragTime');
                    });
                }
            });

            if (changes.length > 0) {
                EventManager.getInstance().publish("canvas:nodesPositionChanged", { 
                    viewId: viewId,
                    nodes: changes,
                    engine: "CYTOSCAPE"
                });
            }
        });
    }

    /**
     * @private
     * @static
     * @description Attaches layout and viewport transformation events.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     */
    private static _attachLayoutEvents(viewId: string, cyInstance: Core): void {
        cyInstance.on('layoutstart', () => cyInstance.scratch('_isLayoutActive', true));
        
        cyInstance.on('layoutstop', () => requestAnimationFrame(() => {
            if (cyInstance && !cyInstance.destroyed()) {
                cyInstance.scratch('_isLayoutActive', false);
                if (typeof document !== "undefined") {
                    EventManager.getInstance().publish("canvas:ready", { viewId: viewId });
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