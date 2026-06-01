/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Visibility Manager for Cytoscape.js.
 * @description Handles logic for showing/hiding specific nodes and managing their DOM events.
 */
import type { Core, NodeSingular } from "cytoscape";
import { DomEvents } from "../../../constants/EventConstants";

export default class CytoscapeVisibilityManager {
    
    /**
     * @public
     * @static
     * @description Restores all hidden nodes to the canvas and notifies the UI.
     */
    public static showHiddenNodes(sViewId: string, cyInstance: Core): void {
        if (!cyInstance) return;
        cyInstance.nodes('.hidden').removeClass('hidden').data('isHidden', false);
        if (typeof document !== "undefined") {
            document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { viewId: sViewId, hasHidden: false, hiddenNodes: [] } }));
            document.dispatchEvent(new CustomEvent(DomEvents.NODE_UNHIDDEN, { detail: { viewId: sViewId } }));
        }
    }

    /**
     * @public
     * @static
     * @description Selectively restores specifically identified nodes to the canvas.
     */
    public static showSpecificNodes(sViewId: string, cyInstance: Core, aNodeIds: string[]): void {
        if (!cyInstance || !aNodeIds || aNodeIds.length === 0) return;
        const selector = aNodeIds.map(id => `#${id}`).join(', ');
        
        let targetNodes = cyInstance.nodes(selector);
        
        // Cascade restore to linked annotation notes
        const linkedNotes = targetNodes.connectedEdges('.annotation-edge').connectedNodes('.annotation-note.hidden');
        targetNodes = targetNodes.union(linkedNotes);
        
        targetNodes.removeClass('hidden').data('isHidden', false);
        
        const remainingHidden = cyInstance.nodes('.hidden');
        const hiddenList = remainingHidden.map((n: NodeSingular) => ({ id: n.data('id'), label: n.data('label') || n.data('id') }));
        if (typeof document !== "undefined") {
            document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { viewId: sViewId, hasHidden: remainingHidden.length > 0, hiddenNodes: hiddenList } }));
            document.dispatchEvent(new CustomEvent(DomEvents.NODE_UNHIDDEN, { detail: { viewId: sViewId } }));
        }
    }
}