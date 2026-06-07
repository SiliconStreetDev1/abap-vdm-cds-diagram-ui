/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace.menu
 * @fileoverview Abstract base strategy for right-click context menus.
 * @description Provides the foundation for building Fiori-styled menu items and encapsulates destruction logic.
 */
import type { Core, NodeCollection, NodeSingular } from "cytoscape";
import { EventManager } from "../../../../events/EventManager";

export default abstract class BaseMenuStrategy {
    protected _viewId: string;

    constructor(viewId: string) {
        this._viewId = viewId;
    }

    public abstract build(menu: HTMLDivElement, targetNodes: NodeCollection, clickedNode: NodeSingular, cyInstance: Core, suffix: string, totalCount: number): void;

    protected _closeMenu(): void {
        const menu = document.getElementById(`vdm-cy-context-menu-${this._viewId}`);
        if (menu) menu.remove();
        const glass = document.getElementById(`vdm-cy-glass-pane-${this._viewId}`);
        if (glass) glass.remove();
    }

    protected _createMenuItem(icon: string, text: string, color: string, onClick: () => void): HTMLDivElement {
        const item = document.createElement("div");
        item.style.padding = "0.5rem 1rem";
        item.style.cursor = "pointer";
        item.style.color = "var(--sapTextColor, #32363a)";
        item.style.fontSize = "0.875rem";
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "0.5rem";
        item.style.transition = "background-color 0.2s";
        
        item.onmouseover = () => item.style.backgroundColor = "var(--sapList_Hover_Background, #f5f5f5)";
        item.onmouseout = () => item.style.backgroundColor = "transparent";
        
        item.innerHTML = `<span style="color: ${color}; font-size: 1rem;">${icon}</span> <span>${text}</span>`;
        
        const fireAction = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
            this._closeMenu();
        };
        item.onmousedown = fireAction;
        item.ontouchstart = fireAction;
        return item;
    }

    /**
     * @protected
     * @description Shared compositional capability for non-destructive exploration.
     * Injected into concrete menu strategies rather than relying on deep inheritance.
     */
    protected _buildExplorationTools(menu: HTMLDivElement, targetNodes: NodeCollection, cyInstance: Core, suffix: string, totalCount: number): void {
        const lockedCount = targetNodes.filter(':locked').length;
        if (lockedCount < totalCount) {
            menu.appendChild(this._createMenuItem("📌", `Pin${suffix}`, "#d32f2f", () => { 
                targetNodes.data('isPinned', true).lock(); 
                EventManager.getInstance().publish("canvas:nodePinned", { viewId: this._viewId }); 
            }));
        } 
        if (lockedCount > 0) {
            menu.appendChild(this._createMenuItem("🔓", `Unlock${suffix}`, "#4caf50", () => { 
                targetNodes.data('isPinned', false).unlock(); 
                EventManager.getInstance().publish("canvas:nodePinned", { viewId: this._viewId }); 
            }));
        }
        menu.appendChild(this._createMenuItem("✖", `Hide${suffix}`, "#333333", () => {
            const linkedNotes = targetNodes.connectedEdges('.annotation-edge').connectedNodes('.annotation-note');
            const nodesToHide = targetNodes.union(linkedNotes);
            nodesToHide.addClass('hidden').data('isHidden', true).unselect();
            EventManager.getInstance().publish("canvas:nodeHidden", { viewId: this._viewId });
            const hiddenList = cyInstance.nodes('.hidden').map((n: NodeSingular) => ({ id: n.id(), label: n.data('label') || n.id() }));
            EventManager.getInstance().publish("canvas:nodesVisibilityChanged", { viewId: this._viewId, hasHidden: hiddenList.length > 0, hiddenNodes: hiddenList });
        }));
    }
}