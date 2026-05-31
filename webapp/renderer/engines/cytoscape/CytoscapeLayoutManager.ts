/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Manages physical constraints, preset positioning, and grid guides.
 */
import CytoscapeLayoutBuilder from "./CytoscapeLayoutBuilder";
import { IParsedCytoscapeConfig } from "./CytoscapeConfigParser";
import { DomEvents } from "../../../constants/EventConstants";

export default class CytoscapeLayoutManager {

    /**
     * @public
     * @static
     * @description Applies a hybrid layout to the Cytoscape instance, locking nodes with presets
     * and allowing orphan nodes to flow naturally using physics-based routing.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @param {IParsedCytoscapeConfig} parsedConfig - The strongly-typed format configuration.
     * @param {number} iNodeCount - The total number of nodes in the graph.
     * @returns {void}
     */
    public static applyHybridLayout(cyInstance: any, parsedConfig: IParsedCytoscapeConfig, iNodeCount: number): void {
        if (parsedConfig.presetPositions) {
            const presets = parsedConfig.presetPositions;
            
            cyInstance.nodes().forEach((n: any) => {
                const pos = presets[n.data('id')];
                if (pos) {
                    n.position({ x: pos.x, y: pos.y });
                    
                    // Restore Hide State
                    if (pos.isHidden) {
                        n.addClass('hidden');
                        n.data('isHidden', true);
                    } else {
                        n.removeClass('hidden');
                        n.data('isHidden', false);
                    }

                    // Restore Pin State explicitly
                    if (pos.isPinned) {
                        n.data('isPinned', true);
                    } else {
                        n.data('isPinned', false);
                    }

                    // Always lock nodes with saved coordinates to preserve the variant shape
                    n.lock();
                }
            });
        }

        const hiddenNodes = cyInstance.nodes('.hidden');
        if (typeof document !== "undefined") {
            document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { hasHidden: hiddenNodes.length > 0 } }));
        }

        const visibleNodes = cyInstance.nodes().filter((n: any) => !n.hasClass('hidden'));
        const lockedNodes = visibleNodes.filter(':locked');
        const unlockedNodes = visibleNodes.filter(':unlocked');
        let layoutConfig = CytoscapeLayoutBuilder.build(parsedConfig, iNodeCount);

        if (lockedNodes.length > 0) {
            if (unlockedNodes.length > 0) {
                layoutConfig = CytoscapeLayoutBuilder.build({ ...parsedConfig, layout: 'cose' }, iNodeCount);
            } else {
                layoutConfig = { name: 'preset', animate: false };
            }
        }

        cyInstance.layout(layoutConfig).run();
    }

    /**
     * @public
     * @static
     * @description Configures and applies the grid alignment and snap-to-grid guidelines.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @param {IParsedCytoscapeConfig} config - The strongly-typed format configuration.
     * @returns {void}
     */
    public static applyGridGuide(cyInstance: any, config: IParsedCytoscapeConfig): void {
        if (cyInstance && typeof cyInstance.gridGuide === 'function') {
            cyInstance.gridGuide({
                drawGrid: config.snapGuides,
                snapToGridOnRelease: false, 
                snapToGridDuringDrag: false, 
                snapToAlignmentLocationOnRelease: false, 
                snapToAlignmentLocationDuringDrag: false, 
                guidelines: config.snapGuides,
                geometricGuideline: true, 
                initPosAlignment: true,
                gridSpacing: 50,
                guidelinesStyle: { strokeStyle: "#0854a0", horizontalDistColor: "#0854a0", verticalDistColor: "#0854a0", lineDash: [5, 5] }
            });
        }
    }
}