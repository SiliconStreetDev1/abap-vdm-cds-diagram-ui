import { IEffectPlugin } from "../IEffectPlugin";
import type { Core } from "cytoscape";

export default class ImpactShockwavePlugin implements IEffectPlugin {
    public getId(): string { return "impact-shockwave"; }
    public getName(): string { return "Visual Impact Shockwaves"; }
    public getDescription(): string { return "Injects a massive CSS ripple expansion ring over the canvas when heavily flinging or dropping nodes from a distance."; }
    
    private cyInstance: Core | null = null;

    public onInit(cyInstance: Core): void {
        this.cyInstance = cyInstance;
    }

    public onNodesDrop(payload: any): void {
        if (!this.cyInstance || !payload.nodes || payload.nodes.length === 0) return;

        // Check if there was significant kinetic impact
        const node = payload.nodes[0];
        const dx = node.newPos.x - node.oldPos.x;
        const dy = node.newPos.y - node.oldPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Only spawn shockwaves for heavy, far-flung drops
        if (distance > 100) {
            this.spawnShockwave(node.newPos.x, node.newPos.y);
        }
    }

    private spawnShockwave(modelX: number, modelY: number): void {
        if (!this.cyInstance || typeof document === "undefined") return;

        // Convert cytoscape internal coordinates to actual screen pixels
        // Use the container offset and zoom level to correctly position the DOM element
        const pan = this.cyInstance.pan();
        const zoom = this.cyInstance.zoom();
        const screenX = (modelX * zoom) + pan.x;
        const screenY = (modelY * zoom) + pan.y;

        const container = this.cyInstance.container();
        if (!container) return;

        const shockwave = document.createElement("div");
        shockwave.style.position = "absolute";
        shockwave.style.left = `${screenX}px`;
        shockwave.style.top = `${screenY}px`;
        shockwave.style.width = "0px";
        shockwave.style.height = "0px";
        shockwave.style.borderRadius = "50%";
        shockwave.style.border = "4px solid rgba(0, 150, 255, 0.8)";
        shockwave.style.transform = "translate(-50%, -50%)";
        shockwave.style.pointerEvents = "none";
        shockwave.style.zIndex = "9999";
        
        // High-performance CSS Transform transition
        shockwave.style.transition = "all 0.4s cubic-bezier(0.1, 0.8, 0.3, 1)";

        container.appendChild(shockwave);

        // Force browser reflow to apply initial state before transitioning
        shockwave.getBoundingClientRect();

        // Trigger animation
        requestAnimationFrame(() => {
            shockwave.style.width = "300px";
            shockwave.style.height = "300px";
            shockwave.style.borderWidth = "0px";
            shockwave.style.opacity = "0";
        });

        // Cleanup DOM after animation completes
        setTimeout(() => {
            if (shockwave.parentNode) {
                shockwave.parentNode.removeChild(shockwave);
            }
        }, 400);
    }
}
