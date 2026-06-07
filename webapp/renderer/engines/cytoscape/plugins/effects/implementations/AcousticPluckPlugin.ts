import type { IEffectPlugin } from "../IEffectPlugin";
import SoundscapeManager from "../../../../../../services/SoundscapeManager";
import { EffectConstants } from "../../../../../../constants/AnimationConstants";

import type { Core } from "cytoscape";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.plugins.effects.implementations
 * @class AcousticPluckPlugin
 * @implements IEffectPlugin
 * @description Provides auditory feedback when nodes traverse edge lines.
 */
export default class AcousticPluckPlugin implements IEffectPlugin {
    
    private cyInstance: Core | null = null;

    /**
     * @public
     * @returns {string} The technical identifier for the plugin.
     */
    public getId(): string { return "acoustic-pluck"; }

    /**
     * @public
     * @returns {string} The localized display name for the Fiori UI.
     */
    public getName(): string { return "Acoustic Edge Pluck"; }
    public getDescription(): string { return "Plays a delicate synthetic harp pluck when dragging a node across an existing edge line."; }

    public onInit(cyInstance: Core): void {
        this.cyInstance = cyInstance;

        // Manage our own physics caching locally to avoid polluting the global event router
        cyInstance.on('grab', 'node', (evt: any) => {
            const node = evt.target;
            const connectedEdges = node.connectedEdges();
            const foreignEdges = cyInstance.edges().difference(connectedEdges);
            
            // Pre-calculate and cache Axis-Aligned Bounding Boxes (AABB) to skip Math.pow inside the 60fps drag loop
            const edgeCache = foreignEdges.map((e: any) => ({
                id: e.id(),
                bb: e.boundingBox(),
                src: e.source().position(),
                tgt: e.target().position()
            }));

            node.scratch('_acoustic_foreignEdges', edgeCache);
            node.scratch('_acoustic_intersectedEdges', new Set<string>());
        });

        cyInstance.on('free', 'node', (evt: any) => {
            const node = evt.target;
            node.removeScratch('_acoustic_foreignEdges');
            node.removeScratch('_acoustic_intersectedEdges');
        });
    }

    public onNodeDrag(nodeId: string, position: { x: number; y: number }): void {
        if (!this.cyInstance) return;
        const node = this.cyInstance.getElementById(nodeId);
        if (!node || node.empty()) return;

        const foreignEdges = node.scratch('_acoustic_foreignEdges');
        if (!foreignEdges) return;

        const nodeRadius = (node.width() / 2) + 5; 
        const previouslyIntersected = node.scratch('_acoustic_intersectedEdges') as Set<string> || new Set<string>();
        const currentlyIntersected = new Set<string>();
        let didPluck = false;

        foreignEdges.forEach((edge: any) => {
            const bb = edge.bb;
            
            // FAST PATH: Spatial AABB Hash check (skip Math.pow if completely outside bounding box)
            if (position.x + nodeRadius < bb.x1 || position.x - nodeRadius > bb.x2 || 
                position.y + nodeRadius < bb.y1 || position.y - nodeRadius > bb.y2) {
                return; 
            }

            const src = edge.src;
            const tgt = edge.tgt;
            
            // Fast Euclidean distance to line segment
            const l2 = Math.pow(tgt.x - src.x, 2) + Math.pow(tgt.y - src.y, 2);
            let dist = 0;
            if (l2 === 0) {
                dist = Math.sqrt(Math.pow(position.x - src.x, 2) + Math.pow(position.y - src.y, 2));
            } else {
                let t = ((position.x - src.x) * (tgt.x - src.x) + (position.y - src.y) * (tgt.y - src.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                dist = Math.sqrt(Math.pow(position.x - (src.x + t * (tgt.x - src.x)), 2) + Math.pow(position.y - (src.y + t * (tgt.y - src.y)), 2));
            }
            
            if (dist < nodeRadius) {
                currentlyIntersected.add(edge.id());
                if (!previouslyIntersected.has(edge.id())) {
                    didPluck = true;
                }
            }
        });
        
        node.scratch('_acoustic_intersectedEdges', currentlyIntersected);
        
        if (didPluck) {
            this.onEdgeCrossed(nodeId);
        }
    }

    /**
     * @public
     * @description Triggers a delicate synthetic harp pluck when a cross occurs.
     * @param {string} nodeId - The ID of the node that crossed an edge.
     */
    public onEdgeCrossed(nodeId: string): void {
        const pitchFreq = EffectConstants.ACOUSTIC.BASE_FREQ_HZ + Math.random() * EffectConstants.ACOUSTIC.RANDOM_VARIANCE_HZ;
        
        // Whisper-quiet harp sound, very fast decay
        SoundscapeManager.playSFX(
            EffectConstants.ACOUSTIC.SYNTH_INDEX, 
            pitchFreq, 
            EffectConstants.ACOUSTIC.ATTENUATION_VOL, 
            EffectConstants.ACOUSTIC.DECAY_S
        );
    }
}
