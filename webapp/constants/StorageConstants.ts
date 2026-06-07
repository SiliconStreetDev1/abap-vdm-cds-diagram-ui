/**
 * @fileoverview Centralized dictionary for persistent LocalStorage keys.
 * @description Eradicates "magic strings" and hardcoded literal keys scattered 
 * across controllers and managers to guarantee safe, deterministic persistence.
 */

export const StorageKeys = {
    AUDIO_ENABLED: "vdmAudioEnabled",
    DISABLED_PLUGINS: "vdm.disabledPlugins"
} as const;
