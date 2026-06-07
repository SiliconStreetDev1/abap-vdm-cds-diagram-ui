import { StorageKeys } from "../../../../../constants/StorageConstants";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.plugins.effects
 * @class PluginConfigManager
 * @description Dedicated Single Responsibility class to manage Gamification plugin persistence.
 */
export default class PluginConfigManager {
    private static instance: PluginConfigManager;
    private disabledPlugins: string[] = [];

    private constructor() {
        this.loadSettings();
    }

    public static getInstance(): PluginConfigManager {
        if (!PluginConfigManager.instance) {
            PluginConfigManager.instance = new PluginConfigManager();
        }
        return PluginConfigManager.instance;
    }

    public isDisabled(pluginId: string): boolean {
        return this.disabledPlugins.includes(pluginId);
    }

    public togglePlugin(id: string, enabled: boolean): void {
        if (enabled) {
            this.disabledPlugins = this.disabledPlugins.filter(disabledId => disabledId !== id);
        } else {
            if (!this.disabledPlugins.includes(id)) {
                this.disabledPlugins.push(id);
            }
        }
        this.saveSettings();
    }

    public resetToDefaults(): void {
        localStorage.removeItem(StorageKeys.DISABLED_PLUGINS);
        localStorage.removeItem('vdmHarpDisabledOnce');
        localStorage.removeItem('vdmExperimentalPluginsDisabledOnce');
        this.loadSettings();
    }

    private loadSettings(): void {
        try {
            const saved = localStorage.getItem(StorageKeys.DISABLED_PLUGINS);
            if (saved) {
                this.disabledPlugins = JSON.parse(saved);
                let needsSave = false;
                
                // MIGRATION: Ensure existing users have the harp disabled by default
                if (localStorage.getItem('vdmHarpDisabledOnce') !== 'true') {
                    if (!this.disabledPlugins.includes("acoustic-pluck")) {
                        this.disabledPlugins.push("acoustic-pluck");
                    }
                    localStorage.setItem('vdmHarpDisabledOnce', 'true');
                    needsSave = true;
                }
                
                // MIGRATION: Ensure new experimental plugins are disabled by default for existing users
                if (localStorage.getItem('vdmExperimentalPluginsDisabledOnce') !== 'true') {
                    const newDefaults = ["selection-chord", "impact-shockwave"];
                    newDefaults.forEach(pluginId => {
                        if (!this.disabledPlugins.includes(pluginId)) {
                            this.disabledPlugins.push(pluginId);
                        }
                    });
                    localStorage.setItem('vdmExperimentalPluginsDisabledOnce', 'true');
                    needsSave = true;
                }

                if (needsSave) {
                    this.saveSettings();
                }
            } else {
                // Disable the Acoustic Pluck (harp) and all new experimental plugins by default
                this.disabledPlugins = ["acoustic-pluck", "selection-chord", "impact-shockwave"];
                localStorage.setItem('vdmHarpDisabledOnce', 'true');
                localStorage.setItem('vdmExperimentalPluginsDisabledOnce', 'true');
            }
        } catch (e) {
            console.warn("Failed to load Gamification settings from localStorage", e);
            this.disabledPlugins = ["acoustic-pluck", "selection-chord", "impact-shockwave"];
        }
    }

    private saveSettings(): void {
        try {
            localStorage.setItem(StorageKeys.DISABLED_PLUGINS, JSON.stringify(this.disabledPlugins));
        } catch (e) {
            console.warn("Failed to save Gamification settings to localStorage", e);
        }
    }
}
