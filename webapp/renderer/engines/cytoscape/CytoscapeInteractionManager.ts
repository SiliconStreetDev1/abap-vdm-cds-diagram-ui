/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Interaction Manager for Cytoscape.js.
 * @description Modifies mouse behavior modes and selection states.
 */
import type { Core } from "cytoscape";
export default class CytoscapeInteractionManager {
    
    /**
     * @public
     * @static
     * @description Modifies internal event listeners to switch between standard canvas panning and node selection mode.
     */
    public static setInteractionMode(cyInstance: Core, mode: "pan" | "select"): void {
        if (!cyInstance) return;
        if (mode === "select") {
            cyInstance.userPanningEnabled(false);
            cyInstance.boxSelectionEnabled(true);
            cyInstance.autoungrabify(false);
        } else {
            cyInstance.userPanningEnabled(true);
            cyInstance.boxSelectionEnabled(true); // Shift+Drag fallback
            cyInstance.autoungrabify(false);
        }
    }

    public static clearSelection(cyInstance: Core): void {
        if (cyInstance) {
            cyInstance.elements().unselect();
        }
    }

    public static selectAll(cyInstance: Core): void {
        if (cyInstance) {
            cyInstance.elements('node:visible').select();
        }
    }
}