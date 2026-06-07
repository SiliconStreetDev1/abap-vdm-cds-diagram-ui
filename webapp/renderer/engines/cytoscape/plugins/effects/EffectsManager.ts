/**
 * @fileoverview Central orchestrator for the Gamification Plugin System.
 * @description Listens to global canvas events, processes any required heavy mathematical physics,
 * and delegates the final payloads cleanly to all registered plugins.
 */
import type { Core } from "cytoscape";
import { EventManager } from "../../../../../events/EventManager";
import { Subscription } from "../../../../../events/Subscription";
import type { IEffectPlugin } from "./IEffectPlugin";
import { StorageKeys } from "../../../../../constants/StorageConstants";

// Import built-in plugins
import RadarPingPlugin from "./implementations/RadarPingPlugin";
import AcousticPluckPlugin from "./implementations/AcousticPluckPlugin";
import WeightyDropPlugin from "./implementations/WeightyDropPlugin";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.plugins.effects
 * @class EffectsManager
 * @description Central orchestrator for the Gamification Plugin System. Listens to global 
 * canvas events, processes configurations, and cleanly delegates payloads to all registered plugins.
 */
export default class EffectsManager {
    private static instance: EffectsManager;
    private plugins: IEffectPlugin[] = [];
    private subscriptions: Subscription[] = [];
    private cyInstance: Core | null = null;

    private disabledPlugins: string[] = [];

    private constructor() {
        this.loadSettings();
        this.registerBuiltInPlugins();
    }

    /**
     * @private
     * @description Hydrates disabled plugin states from the user's LocalStorage.
     */
    private loadSettings(): void {
        try {
            const saved = localStorage.getItem(StorageKeys.DISABLED_PLUGINS);
            if (saved) {
                this.disabledPlugins = JSON.parse(saved);
                
                // MIGRATION: Ensure existing users have the harp disabled by default
                if (localStorage.getItem('vdmHarpDisabledOnce') !== 'true') {
                    if (!this.disabledPlugins.includes("acoustic-pluck")) {
                        this.disabledPlugins.push("acoustic-pluck");
                    }
                    localStorage.setItem('vdmHarpDisabledOnce', 'true');
                    this.saveSettings();
                }
            } else {
                // Disable the Acoustic Pluck (harp) gamification feature by default
                this.disabledPlugins = ["acoustic-pluck"];
                localStorage.setItem('vdmHarpDisabledOnce', 'true');
            }
        } catch (e) {
            console.warn("Failed to load EffectsManager settings from localStorage", e);
            this.disabledPlugins = ["acoustic-pluck"];
        }
    }

    /**
     * @private
     * @description Persists active configurations to LocalStorage.
     */
    private saveSettings(): void {
        try {
            localStorage.setItem(StorageKeys.DISABLED_PLUGINS, JSON.stringify(this.disabledPlugins));
        } catch (e) {
            console.warn("Failed to save EffectsManager settings to localStorage", e);
        }
    }

    /**
     * @public
     * @description Returns a UI-friendly list of all plugins and their active states.
     * @returns {Array<{ id: string, name: string, enabled: boolean }>} Active plugin registry
     */
    public getRegisteredPlugins(): { id: string; name: string; enabled: boolean }[] {
        return this.plugins.map(p => ({
            id: p.getId(),
            name: p.getName(),
            enabled: !this.disabledPlugins.includes(p.getId())
        }));
    }

    /**
     * @public
     * @description Executes togglePlugin functionality.
     */
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

    public static getInstance(): EffectsManager {
        if (!EffectsManager.instance) {
            EffectsManager.instance = new EffectsManager();
        }
        return EffectsManager.instance;
    }

    /**
     * @private
     * Bootstraps the default suite of Enterprise gamification features.
     */
    private registerBuiltInPlugins(): void {
        this.registerPlugin(new RadarPingPlugin());
        this.registerPlugin(new AcousticPluckPlugin());
        this.registerPlugin(new WeightyDropPlugin());
    }

    /**
     * @public
     * @description Executes registerPlugin functionality.
     */
    public registerPlugin(plugin: IEffectPlugin): void {
        this.plugins.push(plugin);
        if (this.cyInstance && plugin.onInit) {
            plugin.onInit(this.cyInstance);
        }
    }

    /**
     * @public
     * @description Executes attachEvents functionality.
     */
    public attachEvents(cyInstance: Core): void {
        this.cyInstance = cyInstance;
        
        // Initialize active plugins
        this.plugins.forEach(p => p.onInit && p.onInit(this.cyInstance!));

        const eventManager = EventManager.getInstance();

        this.subscriptions.push(
            eventManager.subscribe("canvas:nodeDragging", (payload: any) => {
                this.plugins.forEach(p => {
                    if (!this.disabledPlugins.includes(p.getId()) && p.onNodeDrag) p.onNodeDrag(payload.nodeId, payload.position || { x: 0, y: 0 });
                });
            }),
            eventManager.subscribe("canvas:nodesPositionChanged", (payload: any) => {
                this.plugins.forEach(p => {
                    if (!this.disabledPlugins.includes(p.getId()) && p.onNodesDrop) p.onNodesDrop(payload);
                });
            }),
            eventManager.subscribe("canvas:edgePlucked", (payload: any) => {
                if (payload.nodeId) {
                    this.plugins.forEach(p => {
                        if (!this.disabledPlugins.includes(p.getId()) && p.onEdgeCrossed) p.onEdgeCrossed(payload.nodeId!);
                    });
                }
            })
            // Search highlights will be fired from CytoscapeSearchManager directly
        );
    }

    /**
     * @public
     * @description Executes fireSearchHighlight functionality.
     */
    public fireSearchHighlight(nodeIds: string[]): void {
        this.plugins.forEach(p => {
            if (!this.disabledPlugins.includes(p.getId()) && p.onSearchHighlight) p.onSearchHighlight(nodeIds);
        });
    }

    /**
     * @public
     * @description Executes detachEvents functionality.
     */
    public detachEvents(): void {
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        this.plugins.forEach(p => p.onDestroy && p.onDestroy());
        this.cyInstance = null;
    }
}
