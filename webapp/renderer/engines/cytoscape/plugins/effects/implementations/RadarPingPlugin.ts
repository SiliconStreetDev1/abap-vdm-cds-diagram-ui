import type { Core } from "cytoscape";
import type { IEffectPlugin } from "../IEffectPlugin";
import { EffectConstants } from "../../../../../../constants/AnimationConstants";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.plugins.effects.implementations
 * @class RadarPingPlugin
 * @implements IEffectPlugin
 * @description Injects CSS and spawns cascading DOM rings to visually highlight nodes during search.
 */
export default class RadarPingPlugin implements IEffectPlugin {
    private cyInstance: Core | null = null;
    private hasInjectedStyles: boolean = false;

    /**
     * @public
     * @returns {string} The technical identifier for the plugin.
     */
    public getId(): string { return "radar-ping"; }

    /**
     * @public
     * @returns {string} The localized display name for the Fiori UI.
     */
    public getName(): string { return "Radar Search Ping"; }

    /**
     * @public
     * @returns {string} A brief description of the plugin's functionality.
     */
    public getDescription(): string { return "Plays an underwater sonar 'ping' when a search successfully locates nodes."; }

    /**
     * @public
     * @description Captures the cytoscape instance on initialization to query screen coordinates later.
     * @param {Core} cyInstance - The active Cytoscape graph container.
     */
    public onInit(cyInstance: Core): void {
        this.cyInstance = cyInstance;
    }

    /**
     * @private
     * @description Injects the required @keyframes and CSS definitions once into the document head.
     */
    private injectRadarStyles(): void {
        if (this.hasInjectedStyles || typeof document === 'undefined' || document.getElementById('cy-radar-styles')) return;
        const style = document.createElement('style');
        style.id = 'cy-radar-styles';
        style.innerHTML = `
            @keyframes cyRadarPing1 { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(12); opacity: 0; } }
            @keyframes cyRadarPing2 { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(8); opacity: 0; } }
            @keyframes cyRadarPing3 { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(5); opacity: 0; } }
            
            .cy-radar-ping {
                position: absolute;
                border-radius: 50%;
                border: 1px solid #0854a0;
                pointer-events: none;
                z-index: 9999;
            }
            .cy-radar-ping-1 { animation: cyRadarPing1 2.5s cubic-bezier(0.1, 0.8, 0.3, 1) forwards; }
            .cy-radar-ping-2 { animation: cyRadarPing2 2.0s cubic-bezier(0.1, 0.8, 0.3, 1) forwards; }
            .cy-radar-ping-3 { animation: cyRadarPing3 1.5s cubic-bezier(0.1, 0.8, 0.3, 1) forwards; }
        `;
        document.head.appendChild(style);
        this.hasInjectedStyles = true;
    }

    /**
     * @public
     * @description Calculates absolute viewport coordinates and spawns 3 staggered DOM elements.
     * @param {string[]} nodeIds - The array of nodes successfully found during a search.
     */
    public onSearchHighlight(nodeIds: string[]): void {
        if (!this.cyInstance || typeof document === 'undefined') return;

        // Trigger the Radar Ping visual effect after the camera finishes moving
        setTimeout(() => {
            this.injectRadarStyles();
            const container = this.cyInstance!.container();
            if (!container) return;

            nodeIds.forEach(nodeId => {
                const node = this.cyInstance!.getElementById(nodeId);
                if (!node || node.empty()) return;
                
                const pos = node.renderedPosition();
                const radarSize = EffectConstants.RADAR.SIZE_PX; 

                const spawnRing = (scaleClass: string, delayMs: number) => {
                    setTimeout(() => {
                        if (!document.getElementById(container.id)) return; // Prevent spawning if diagram destroyed
                        const radar = document.createElement('div');
                        radar.className = `${EffectConstants.RADAR.CSS_CLASS_PREFIX} ${scaleClass}`;
                        radar.style.width = radarSize + 'px';
                        radar.style.height = radarSize + 'px';
                        radar.style.left = (pos.x - radarSize / 2) + 'px';
                        radar.style.top = (pos.y - radarSize / 2) + 'px';
                        
                        container.appendChild(radar);
                        
                        setTimeout(() => {
                            if (radar.parentNode) radar.parentNode.removeChild(radar);
                        }, EffectConstants.RADAR.DOM_LIFECYCLE_MS);
                    }, delayMs);
                };

                // Spawn cascading sonar rings
                spawnRing(`${EffectConstants.RADAR.CSS_CLASS_PREFIX}-1`, 0);
                spawnRing(`${EffectConstants.RADAR.CSS_CLASS_PREFIX}-2`, EffectConstants.RADAR.RING_STAGGER_MS);
                spawnRing(`${EffectConstants.RADAR.CSS_CLASS_PREFIX}-3`, EffectConstants.RADAR.RING_STAGGER_MS * 2);
            });
        }, EffectConstants.RADAR.CAMERA_PAN_DELAY_MS);
    }
}
