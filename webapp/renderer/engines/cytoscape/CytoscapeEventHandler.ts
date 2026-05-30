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