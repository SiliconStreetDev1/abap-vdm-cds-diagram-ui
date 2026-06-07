/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Search manager for Cytoscape.js.
 */
import type { Core, NodeSingular } from "cytoscape";
import EffectsManager from "./plugins/effects/EffectsManager";

export default class CytoscapeSearchManager {

    /**
     * @public
     * @static
     * @description Searches for nodes matching the query and focuses the camera on them.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {string} query - The text query to search for.
     * @returns {void}
     */
    public static search(cyInstance: Core, query: string): void {
        if (!cyInstance) return;
        
        cyInstance.elements().removeClass('search-highlight');
        
        if (!query || query.trim() === "") return;
        
        const lowerQuery = query.toLowerCase();
        const foundNodes = cyInstance.nodes().filter((node: NodeSingular) => {
            const id = node.data('id') || "";
            const label = node.data('displayLabel') || node.data('label') || "";
            return id.toLowerCase().includes(lowerQuery) || label.toLowerCase().includes(lowerQuery);
        });

        if (foundNodes.length > 0) {
            foundNodes.addClass('search-highlight');
            cyInstance.animate({ fit: { eles: foundNodes, padding: 50 }, duration: 750, easing: 'ease-in-out-cubic' });

            // Fire the plugin hook so decoupled effects can render a radar ping
            EffectsManager.getInstance().fireSearchHighlight(foundNodes.map(n => n.id()));
        }
    }
}