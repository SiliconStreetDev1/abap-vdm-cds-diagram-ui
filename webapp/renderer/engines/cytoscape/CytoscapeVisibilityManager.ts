/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Visibility Manager for Cytoscape.js.
 * @description Handles logic for showing/hiding specific nodes and managing their DOM events.
 */
import type { Core, NodeSingular } from "cytoscape";
import { EventManager } from "../../../events/EventManager";

export default class CytoscapeVisibilityManager {
    
    /**
     * @public
     * @static
     * @description Restores all hidden nodes to the canvas and notifies the UI.
     */
    public static showHiddenNodes(viewId: string, cyInstance: Core): void {
        if (!cyInstance) return;
        cyInstance.nodes('.hidden').removeClass('hidden').data('isHidden', false);
        EventManager.getInstance().publish("canvas:nodesVisibilityChanged", { viewId: viewId, hasHidden: false, hiddenNodes: [] });
        EventManager.getInstance().publish("canvas:nodeUnhidden", { viewId: viewId });
    }

    /**
     * @public
     * @static
     * @description Selectively restores specifically identified nodes to the canvas.
     */
    public static showSpecificNodes(viewId: string, cyInstance: Core, nodeIds: string[]): void {
        if (!cyInstance || !nodeIds || nodeIds.length === 0) return;
        const selector = nodeIds.map(id => `#${id}`).join(', ');
        
        let targetNodes = cyInstance.nodes(selector);
        
        // Cascade restore to linked annotation notes
        const linkedNotes = targetNodes.connectedEdges('.annotation-edge').connectedNodes('.annotation-note.hidden');
        targetNodes = targetNodes.union(linkedNotes);
        
        targetNodes.removeClass('hidden').data('isHidden', false);
        
        const remainingHidden = cyInstance.nodes('.hidden');
        const hiddenList = remainingHidden.map((n: NodeSingular) => ({ id: n.data('id'), label: n.data('label') || n.data('id') }));
        EventManager.getInstance().publish("canvas:nodesVisibilityChanged", { viewId: viewId, hasHidden: remainingHidden.length > 0, hiddenNodes: hiddenList });
        EventManager.getInstance().publish("canvas:nodeUnhidden", { viewId: viewId });
    }
}