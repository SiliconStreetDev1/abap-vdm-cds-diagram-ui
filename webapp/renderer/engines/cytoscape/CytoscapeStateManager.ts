/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview State Manager for Cytoscape.js.
 * @description Extracts canvas coordinates, zoom, and metadata for saving view variants.
 */
import type { Core, NodeSingular, EdgeSingular } from "cytoscape";
export default class CytoscapeStateManager {
    
    /**
     * @public
     * @static
     * @description Returns the X/Y coordinates of all current nodes for variant persistence.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @returns {Record<string, any>} Serialized state mapping.
     */
    public static getCanvasState(cyInstance: Core): Record<string, any> {
        const state: Record<string, any> = {};
        if (!cyInstance) return state;
        
        state.__camera = { zoom: cyInstance.zoom(), pan: cyInstance.pan() };
        
        cyInstance.nodes().forEach((n: NodeSingular) => {
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
        
        cyInstance.edges('.annotation-edge').forEach((e: EdgeSingular) => {
            state[e.data('id')] = { isEdge: true, source: e.data('source'), target: e.data('target') };
        });
        return state;
    }
}