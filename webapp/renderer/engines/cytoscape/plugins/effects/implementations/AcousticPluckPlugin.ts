import type { IEffectPlugin } from "../IEffectPlugin";
import SoundscapeManager from "../../../../../../services/SoundscapeManager";
import { EffectConstants } from "../../../../../../constants/AnimationConstants";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.plugins.effects.implementations
 * @class AcousticPluckPlugin
 * @implements IEffectPlugin
 * @description Provides auditory feedback when nodes traverse edge lines.
 */
export default class AcousticPluckPlugin implements IEffectPlugin {
    
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
