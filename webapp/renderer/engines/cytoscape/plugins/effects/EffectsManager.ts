/**
 * @fileoverview Central orchestrator for the Gamification Plugin System.
 * @description Listens to global canvas events, processes any required heavy mathematical physics,
 * and delegates the final payloads cleanly to all registered plugins.
 */
import type { Core } from "cytoscape";
import { EventManager } from "../../../../../events/EventManager";
import { Subscription } from "../../../../../events/Subscription";
import type { IEffectPlugin } from "./IEffectPlugin";
import PluginConfigManager from "./PluginConfigManager";

// Import built-in plugins
import RadarPingPlugin from "./implementations/RadarPingPlugin";
import AcousticPluckPlugin from "./implementations/AcousticPluckPlugin";
import WeightyDropPlugin from "./implementations/WeightyDropPlugin";
import SelectionChordPlugin from "./implementations/SelectionChordPlugin";
import ImpactShockwavePlugin from "./implementations/ImpactShockwavePlugin";

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

    private constructor() {
        this.registerBuiltInPlugins();
    }

    /**
     * @private
     * @description Provides an execution sandbox to prevent broken third-party plugins from crashing the Fiori loop.
     */
    private safeExecute(plugin: IEffectPlugin, action: () => void): void {
        if (PluginConfigManager.getInstance().isDisabled(plugin.getId())) return;
        try {
            action();
        } catch (e) {
            console.warn(`[EffectsManager] Isolated gamification crash intercepted in plugin '${plugin.getId()}':`, e);
        }
    }

    /**
     * @public
     * @description Returns a UI-friendly list of all plugins and their active states.
     * @returns {Array<{ id: string, name: string, description: string, enabled: boolean }>} Active plugin registry
     */
    public getRegisteredPlugins(): { id: string; name: string; description: string; enabled: boolean }[] {
        return this.plugins.map(p => ({
            id: p.getId(),
            name: p.getName(),
            description: p.getDescription ? p.getDescription() : "",
            enabled: !PluginConfigManager.getInstance().isDisabled(p.getId())
        }));
    }

    /**
     * @public
     * @description Executes togglePlugin functionality via ConfigManager.
     */
    public togglePlugin(id: string, enabled: boolean): void {
        PluginConfigManager.getInstance().togglePlugin(id, enabled);
    }

    /**
     * @public
     * @description Wipes custom configurations from LocalStorage and reloads enterprise defaults.
     */
    public resetToDefaults(): void {
        PluginConfigManager.getInstance().resetToDefaults();
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
        this.registerPlugin(new SelectionChordPlugin());
        this.registerPlugin(new ImpactShockwavePlugin());
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
                this.plugins.forEach(p => this.safeExecute(p, () => p.onNodeDrag && p.onNodeDrag(payload.nodeId, payload.position || { x: 0, y: 0 })));
            }),
            eventManager.subscribe("canvas:nodesPositionChanged", (payload: any) => {
                this.plugins.forEach(p => this.safeExecute(p, () => p.onNodesDrop && p.onNodesDrop(payload)));
            }),
            eventManager.subscribe("canvas:edgePlucked", (payload: any) => {
                if (payload.nodeId) {
                    this.plugins.forEach(p => this.safeExecute(p, () => p.onEdgeCrossed && p.onEdgeCrossed(payload.nodeId!)));
                }
            }),
            eventManager.subscribe("canvas:cameraMoved", (payload: any) => {
                this.plugins.forEach(p => this.safeExecute(p, () => p.onCameraMove && p.onCameraMove(payload.pan, payload.zoom)));
            }),
            eventManager.subscribe("canvas:selectionBoxEnded", (payload: any) => {
                this.plugins.forEach(p => this.safeExecute(p, () => p.onSelectionBox && p.onSelectionBox(payload.selectedNodeIds)));
            }),
            eventManager.subscribe("canvas:nodeHidden", (payload: any) => {
                if (payload.hiddenNodeIds) {
                    this.plugins.forEach(p => this.safeExecute(p, () => p.onNodesHidden && p.onNodesHidden(payload.hiddenNodeIds)));
                }
            }),
            eventManager.subscribe("canvas:deleteSelectionRequest", (payload: any) => {
                if (this.cyInstance) {
                    const selectedIds = this.cyInstance.elements('node:selected').map((n: any) => n.id());
                    if (selectedIds.length > 0) {
                        this.plugins.forEach(p => this.safeExecute(p, () => p.onNodesDeleted && p.onNodesDeleted(selectedIds)));
                    }
                }
            })
        );
    }

    /**
     * @public
     * @description Executes fireSearchHighlight functionality.
     */
    public fireSearchHighlight(nodeIds: string[]): void {
        this.plugins.forEach(p => this.safeExecute(p, () => p.onSearchHighlight && p.onSearchHighlight(nodeIds)));
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
