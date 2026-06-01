/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Interaction Manager for Cytoscape.js.
 * @description Modifies mouse behavior modes and selection states.
 */
export default class CytoscapeInteractionManager {
    
    /**
     * @public
     * @static
     * @description Modifies internal event listeners to switch between standard canvas panning and node selection mode.
     */
    public static setInteractionMode(cyInstance: any, sMode: "pan" | "select"): void {
        if (!cyInstance) return;
        if (sMode === "select") {
            cyInstance.userPanningEnabled(false);
            cyInstance.boxSelectionEnabled(true);
            cyInstance.autoungrabify(false);
        } else {
            cyInstance.userPanningEnabled(true);
            cyInstance.boxSelectionEnabled(true); // Shift+Drag fallback
        }
    }

    public static clearSelection(cyInstance: any): void {
        if (cyInstance) {
            cyInstance.elements().unselect();
        }
    }
}