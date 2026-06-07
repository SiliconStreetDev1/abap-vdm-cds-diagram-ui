/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Manages physical constraints, preset positioning, and grid guides.
 */
import CytoscapeLayoutBuilder from "./CytoscapeLayoutBuilder";
import { IParsedCytoscapeConfig } from "./CytoscapeConfigParser";
import { EventManager } from "../../../events/EventManager";
import type { Core, NodeSingular } from "cytoscape";

export default class CytoscapeLayoutManager {

    /**
     * @public
     * @static
     * @description Applies a hybrid layout to the Cytoscape instance, locking nodes with presets
     * and allowing orphan nodes to flow naturally using physics-based routing.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {IParsedCytoscapeConfig} parsedConfig - The strongly-typed format configuration.
     * @param {number} iNodeCount - The total number of nodes in the graph.
     * @returns {void}
     */
    public static applyHybridLayout(viewId: string, cyInstance: Core, parsedConfig: IParsedCytoscapeConfig, iNodeCount: number): void {
        let bIsHybrid = false;
        const bUsePresetsForPositions = parsedConfig.layout === 'preset';

        if (parsedConfig.presetPositions) {
            const presets = parsedConfig.presetPositions;
            
            // NOTE: Nodes and Edges are deliberately restored in two separate passes.
            // Cytoscape will throw a fatal exception if an edge is added before its source/target nodes exist.
            // Pre-flight check: Re-inject visual sticky notes that were saved in the Variant
            Object.keys(presets).forEach(key => {
                const pos = presets[key];
                if (pos.isNote && !cyInstance.getElementById(key).length) {
                    cyInstance.add({
                        group: 'nodes',
                        data: { id: key, label: pos.label, fontFamily: pos.fontFamily, bgColor: pos.bgColor, borderColor: pos.borderColor },
                        classes: 'annotation-note',
                        position: { x: pos.x ?? 0, y: pos.y ?? 0 }
                    });
                }
            });

            // Pre-flight check: Re-inject visual sticky note edges
            Object.keys(presets).forEach(key => {
                const pos = presets[key];
                // Only restore the line if the entities it connects still exist in the diagram!
                if (pos.isEdge && pos.source && pos.target && !cyInstance.getElementById(key).length && cyInstance.getElementById(pos.source).length && cyInstance.getElementById(pos.target).length) {
                    cyInstance.add({
                        group: 'edges',
                        data: { id: key, source: pos.source, target: pos.target },
                        classes: 'annotation-edge'
                    });
                }
            });

            if (bUsePresetsForPositions) {
                // First pass: identify if there are new nodes without preset positions
                const unmappedNodes = cyInstance.nodes().filter((n: NodeSingular) => !presets[n.data('id')] && !n.hasClass('annotation-note'));
                bIsHybrid = unmappedNodes.length > 0;

                cyInstance.nodes().forEach((n: NodeSingular) => {
                    const pos = presets[n.data('id')];
                    if (pos && !pos.isEdge) {
                        n.position({ x: pos.x ?? 0, y: pos.y ?? 0 });
                        
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

                        // Temporarily lock mapped nodes ONLY if the layout engine is going to physically build around them
                        if (bIsHybrid) {
                            n.lock();
                        }
                    }
                });
            }
        }

        // Always lock explicitly pinned nodes regardless of layout type
        cyInstance.nodes().filter((n: NodeSingular) => n.data('isPinned')).lock();

        const hiddenNodes = cyInstance.nodes('.hidden');
        if (typeof document !== "undefined") {
            const hiddenList = hiddenNodes.map((n: NodeSingular) => ({ id: n.data('id'), label: n.data('label') || n.data('id') }));
            EventManager.getInstance().publish("canvas:nodesVisibilityChanged", { viewId: viewId, hasHidden: hiddenNodes.length > 0, hiddenNodes: hiddenList });
        }

        let layoutConfig = CytoscapeLayoutBuilder.build(parsedConfig, iNodeCount);

        if (parsedConfig.presetPositions && bUsePresetsForPositions) {
            if (bIsHybrid) {
                layoutConfig = CytoscapeLayoutBuilder.build({ ...parsedConfig, layout: 'cose' }, iNodeCount);
            } else {
                layoutConfig = { name: 'preset', animate: false, fit: true };
            }
        }

        const fnUnlock = () => {
            if (cyInstance && !cyInstance.destroyed()) {
                cyInstance.nodes().filter((n: NodeSingular) => !n.data('isPinned')).unlock();

                // ENTERPRISE UX: Smart Fit (Viewport Drift Prevention)
                // Absolute camera coordinates saved on a 4K monitor will push diagrams off-screen on laptops.
                // Unless this is an explicit Undo/Redo sequence, we gracefully force a global bounding box fit.
                if (!parsedConfig.isRestore) {
                    cyInstance.scratch('_isSystemViewportChange', true);
                    cyInstance.fit(cyInstance.elements(), 50);
                    
                    // Cap the maximum zoom for tiny diagrams to prevent absurdly large rendering
                    if (cyInstance.zoom() > 1.2) {
                        cyInstance.zoom(1.2);
                        cyInstance.center(cyInstance.elements());
                    }
                    cyInstance.scratch('_isSystemViewportChange', false);
                }
            }
        };

        const layoutElements = cyInstance.elements().difference('.annotation-note, .annotation-edge');

        if (layoutConfig.name === 'preset') {
            layoutElements.layout(layoutConfig).run();
            requestAnimationFrame(fnUnlock); // Defer unlock until next frame to ensure coordinates settled
        } else {
            cyInstance.one('layoutstop', fnUnlock);
            layoutElements.layout(layoutConfig).run();
        }
    }

    /**
     * @public
     * @static
     * @description Configures and applies the grid alignment and snap-to-grid guidelines.
     * @param {Core} cyInstance - The active Cytoscape.js instance.
     * @param {IParsedCytoscapeConfig} config - The strongly-typed format configuration.
     * @returns {void}
     */
    public static applyGridGuide(cyInstance: Core, config: IParsedCytoscapeConfig): void {
        if (cyInstance && typeof (cyInstance as any).gridGuide === 'function') {
            (cyInstance as any).gridGuide({
                drawGrid: config.snapGuides,
                snapToGridOnRelease: false, 
                snapToGridDuringDrag: false, 
                snapToAlignmentLocationOnRelease: false, 
                snapToAlignmentLocationDuringDrag: config.snapGuides, 
                guidelines: config.snapGuides,
                geometricGuideline: true, 
                initPosAlignment: true,
                gridSpacing: 50,
                guidelinesStyle: { strokeStyle: "#0854a0", horizontalDistColor: "#0854a0", verticalDistColor: "#0854a0", lineDash: [5, 5] }
            });
        }
    }
}