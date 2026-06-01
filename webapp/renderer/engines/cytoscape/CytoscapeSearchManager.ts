/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Search manager for Cytoscape.js.
 * @description Handles searching and highlighting specific nodes within the active graph.
 */
import type { Core, NodeSingular } from "cytoscape";
export default class CytoscapeSearchManager {

    /**
     * @public
     * @static
     * @description Searches for nodes matching the query and focuses the camera on them.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {string} sQuery - The text query to search for.
     * @returns {void}
     */
    public static search(cyInstance: Core, sQuery: string): void {
        if (!cyInstance) return;
        
        cyInstance.elements().removeClass('search-highlight');
        
        if (!sQuery || sQuery.trim() === "") return;
        
        const query = sQuery.toLowerCase();
        const foundNodes = cyInstance.nodes().filter((node: NodeSingular) => {
            const id = node.data('id') || "";
            const label = node.data('displayLabel') || node.data('label') || "";
            return id.toLowerCase().includes(query) || label.toLowerCase().includes(query);
        });

        if (foundNodes.length > 0) {
            foundNodes.addClass('search-highlight');
            cyInstance.animate({ fit: { eles: foundNodes, padding: 50 }, duration: 750, easing: 'ease-in-out-cubic' });
        }
    }
}