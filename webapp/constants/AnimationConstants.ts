/**
 * @fileoverview Centralized dictionary for Gamification physics and animation timings.
 * @description Eradicates "magic numbers" across physics plugins and visual effects.
 */

export const EffectConstants = {
    RADAR: {
        SIZE_PX: 20,
        CSS_CLASS_PREFIX: "cy-radar-ping",
        CAMERA_PAN_DELAY_MS: 750,
        DOM_LIFECYCLE_MS: 2600,
        RING_STAGGER_MS: 400
    },
    ACOUSTIC: {
        BASE_FREQ_HZ: 600,
        RANDOM_VARIANCE_HZ: 200,
        ATTENUATION_VOL: 0.0001,
        DECAY_S: 0.03,
        SYNTH_INDEX: 9
    },
    WEIGHT: {
        MIN_TRIGGER_DIST: 0.5,
        VELOCITY_MULTIPLIER: 100,
        MAX_FREQ_CAP_HZ: 150,
        BASE_VOL_RATIO: 0.002,
        MAX_VOL_CAP: 0.1,
        SYNTH_INDEX: 11
    }
} as const;
