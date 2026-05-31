/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Event handler registry for Cytoscape.js.
 * @description Binds user interaction events (click, double click, selection) on the graph to Fiori UI dispatchers.
 */
import { DomEvents } from "../../../constants/EventConstants";

export default class CytoscapeEventHandler {

    /**
     * @public
     * @static
     * @description Attaches standard interaction events to the given Cytoscape instance.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @returns {void}
     */
    public static attachEvents(cyInstance: any): void {
        // Track Box Selection state to prevent Focus Mode from triggering during Marquee lassoing
        cyInstance.on('boxstart', () => cyInstance.scratch('_isBoxSelecting', true));
        cyInstance.on('boxend', () => setTimeout(() => cyInstance.scratch('_isBoxSelecting', false), 50));

        cyInstance.on('select unselect', (evt: any) => {
            const selected = cyInstance.elements('node:selected');
            
            cyInstance.elements().removeClass('faded highlighted');
            
            let bFocus = false;
            let sFocusName = "";
            
            // Detect if the user is holding a modifier key to perform a multi-select operation
            const bIsMultiSelectModifier = evt.originalEvent && (evt.originalEvent.ctrlKey || evt.originalEvent.metaKey || evt.originalEvent.shiftKey);
            
            // Detect if the selection was triggered via Marquee Box Selection
            const bIsBoxSelecting = cyInstance.scratch('_isBoxSelecting');

            // Enterprise UX: Focus Mode is strictly for single-entity discovery.
            // If > 1 node is selected (Mass Selection), we instantly abort the fade to retain full visual context.
            // We also suppress focus if a modifier key is held, or if the user is actively using the box selection tool.
            if (selected.length === 1 && !selected.hasClass('hidden') && !bIsMultiSelectModifier && !bIsBoxSelecting) {
                const neighborhood = selected.closedNeighborhood();
                cyInstance.elements().difference(neighborhood).addClass('faded');
                neighborhood.addClass('highlighted');
                
                bFocus = true;
                sFocusName = selected[0].data('label') || selected[0].id();
            }
            
            if (typeof document !== "undefined") {
                document.dispatchEvent(new CustomEvent(DomEvents.FOCUS_MODE_CHANGED, { 
                    detail: { isFocused: bFocus, nodeName: sFocusName } 
                }));
            }
        });

        // Enterprise UX: Clicking the background canvas instantly drops any active selections
        cyInstance.on('tap', (evt: any) => {
            if (evt.target === cyInstance) {
                cyInstance.elements().unselect();
            }
        });

        cyInstance.on('select', 'node', (evt: any) => {
            evt.target.data('_lastSelectTime', Date.now());
        });

        cyInstance.on('tap', 'node', (evt: any) => {
            const node = evt.target;
            
            // Enterprise UX Toggle-Click: If the node is already selected and wasn't just selected 
            // in this exact click cycle (300ms buffer), unselect it.
            if (node.selected() && Date.now() - (node.data('_lastSelectTime') || 0) > 300) {
                node.unselect();
            }
            
            document.dispatchEvent(new CustomEvent(DomEvents.NODE_CLICKED, { detail: { viewName: node.data('id') } }));
        });

        cyInstance.on('dbltap', 'node', (evt: any) => {
            const node = evt.target;
            document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRILL_DOWN, { detail: { viewName: node.data('id') } }));
        });

        cyInstance.on('closeMinimap', () => {
            document.dispatchEvent(new CustomEvent(DomEvents.CLOSE_MINIMAP, {}));
        });

        cyInstance.on('drag', 'node', () => {
            document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, {}));
        });
    }

    /**
     * @public
     * @static
     * @description Attaches custom snap-to-grid logic. This ensures the top-left corner 
     * of dynamically sized nodes aligns perfectly with the visual grid, overriding 
     * the extension's default center-snapping behavior.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @param {() => boolean} fnIsSnapEnabled - Callback to check if snapping is currently active in the UI.
     * @returns {void}
     */
    public static attachGridSnapEvent(cyInstance: any, fnIsSnapEnabled: () => boolean): void {
        const GRID_SIZE = 50; // Hardcoded visual grid step size

        cyInstance.on('free', 'node', (evt: any) => {
            if (!fnIsSnapEnabled()) return;
            
            const node = evt.target;
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