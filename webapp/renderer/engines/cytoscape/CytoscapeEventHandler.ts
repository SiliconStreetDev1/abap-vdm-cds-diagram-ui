/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Event handler registry for Cytoscape.js.
 * @description Binds user interaction events (click, double click, selection) on the graph to Fiori UI dispatchers.
 */
export default class CytoscapeEventHandler {

    /**
     * @public
     * @static
     * @description Attaches standard interaction events to the given Cytoscape instance.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @returns {void}
     */
    public static attachEvents(cyInstance: any): void {
        cyInstance.on('select unselect', () => {
            const selected = cyInstance.elements('node:selected');
            
            cyInstance.elements().removeClass('faded highlighted');
            
            if (selected.length === 1) {
                const neighborhood = selected.closedNeighborhood();
                cyInstance.elements().difference(neighborhood).addClass('faded');
                neighborhood.addClass('highlighted');
            } else if (selected.length > 1) {
                const isolated = selected.union(selected.edgesWith(selected));
                cyInstance.elements().difference(isolated).addClass('faded');
                isolated.addClass('highlighted');
            }
        });

        cyInstance.on('tap', 'node', (evt: any) => {
            const node = evt.target;
            document.dispatchEvent(new CustomEvent("CdsNodeClicked", { detail: { viewName: node.data('id') } }));
        });

        cyInstance.on('dbltap', 'node', (evt: any) => {
            const node = evt.target;
            document.dispatchEvent(new CustomEvent("CdsNodeDrillDownRequest", { detail: { viewName: node.data('id') } }));
        });

        cyInstance.on('closeMinimap', () => {
            document.dispatchEvent(new CustomEvent("CdsCloseMinimapRequest", {}));
        });
    }
}