import type { IEffectPlugin } from "../IEffectPlugin";
import SoundscapeManager from "../../../../../../services/SoundscapeManager";
import { EffectConstants } from "../../../../../../constants/AnimationConstants";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.plugins.effects.implementations
 * @class WeightyDropPlugin
 * @implements IEffectPlugin
 * @description Provides a cinematic, physics-based thud sound when users drop dragged nodes.
 */
export default class WeightyDropPlugin implements IEffectPlugin {
    
    private lastDragTick: number = 0;
    private lastPos: { x: number; y: number } | null = null;
    private accumulatedDistance: number = 0;
    private activeDragNode: string | null = null;
    
    /**
     * @public
     * @returns {string} The technical identifier for the plugin.
     */
    public getId(): string { return "weighty-drop"; }

    /**
     * @public
     * @returns {string} The localized display name for the Fiori UI.
     */
    public getName(): string { return "Weighty Node Drop"; }

    /**
     * @public
     * @description Provides continuous audio feedback while nodes are actively dragged.
     * @param {string} nodeId - Target node.
     * @param {Object} position - Coordinates.
     */
    public onNodeDrag(nodeId: string, position: { x: number; y: number }): void {
        const now = Date.now();
        
        // Multi-select defense: Lock onto the primary dragged node to prevent 
        // hundreds of overlapping sounds from firing simultaneously on group drags.
        if (!this.activeDragNode) {
            this.activeDragNode = nodeId;
        } else if (this.activeDragNode !== nodeId) {
            return;
        }

        if (!this.lastPos) {
            this.lastPos = { ...position };
            this.lastDragTick = now;
            return;
        }

        // Calculate spatial delta
        const dx = position.x - this.lastPos.x;
        const dy = position.y - this.lastPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Micro-impact modeling: Accumulate physical distance rather than using a static time interval.
        this.accumulatedDistance += distance;
        
        // Trigger a tactile "click" every 15 pixels of movement
        const SPATIAL_THRESHOLD = 15;

        if (this.accumulatedDistance >= SPATIAL_THRESHOLD) {
            const timeDelta = Math.max(1, now - this.lastDragTick);
            const velocity = this.accumulatedDistance / timeDelta; // Pixels per ms
            
            // Map physical velocity to Pitch (faster = higher friction pitch, 150Hz -> 300Hz)
            const pitch = Math.min(150 + (velocity * 40), 300);
            
            // Map physical velocity to Volume (increased by another 15% as requested)
            const volume = Math.min(0.00066125 + (velocity * 0.00066125), 0.00198375);
            
            // Subtle, organic wooden tick (legacy rlo-engine sound)
            SoundscapeManager.playSFX(128, pitch, volume, 0.05);

            this.accumulatedDistance = 0;
            this.lastDragTick = now;
        }

        this.lastPos = { ...position };
    }

    /**
     * @public
     * @description Calculates impact velocity based on distance and triggers audio playback.
     * @param {Object} payload - The positional translation data of the dropped nodes.
     */
    public onNodesDrop(payload: { nodes: { nodeId: string; oldPos: { x: number; y: number }; newPos: { x: number; y: number } }[] }): void {
        let maxDistance = 0;
        
        if (payload && payload.nodes && Array.isArray(payload.nodes)) {
            payload.nodes.forEach((node) => {
                const dx = node.newPos.x - node.oldPos.x;
                const dy = node.newPos.y - node.oldPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > maxDistance) {
                    maxDistance = dist;
                }
            });
        }

        // If the user paused their drag before releasing the mouse, bleed off all kinetic energy!
        // No movement in the last 150ms means a stationary drop (no drum thud).
        const timeSinceLastMotion = Date.now() - this.lastDragTick;
        if (timeSinceLastMotion > 150) {
            maxDistance = 0;
        }

        if (maxDistance > EffectConstants.WEIGHT.MIN_TRIGGER_DIST) {
            const impactVelocity = Math.min(maxDistance * EffectConstants.WEIGHT.VELOCITY_MULTIPLIER, EffectConstants.WEIGHT.MAX_FREQ_CAP_HZ);
            const volume = Math.min(maxDistance * EffectConstants.WEIGHT.BASE_VOL_RATIO, EffectConstants.WEIGHT.MAX_VOL_CAP);
            
            // Deep FM synth for a "thud" effect
            SoundscapeManager.playSFX(EffectConstants.WEIGHT.SYNTH_INDEX, impactVelocity, volume, 0.1);
        }
        
        // Reset drag tracking memory for the next grab session
        this.lastPos = null;
        this.accumulatedDistance = 0;
        this.activeDragNode = null;
    }
}
