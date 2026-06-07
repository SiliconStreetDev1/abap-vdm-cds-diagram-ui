/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Native Fiori Context Menu for Cytoscape.
 * @description Encapsulates the dynamic HTML construction for right-click node menus.
 */
import type { Core, NodeSingular, EventObject, NodeCollection } from "cytoscape";
import BaseMenuStrategy from "./menu/BaseMenuStrategy";
import ViewerMenuStrategy from "./menu/ViewerMenuStrategy";
import DrillDownMenuStrategy from "./menu/DrillDownMenuStrategy";
import BuilderEntityMenuStrategy from "./menu/BuilderEntityMenuStrategy";

export default class CytoscapeContextMenu {

    /**
     * @public
     * @static
     * @description Safely removes any active context menu and glass pane from the DOM.
     */
    public static removeAll(viewId: string): void {
        const existing = document.getElementById(`vdm-cy-context-menu-${viewId}`);
        if (existing) existing.remove();
        const glass = document.getElementById(`vdm-cy-glass-pane-${viewId}`);
        if (glass) glass.remove();
    }

    /**
     * @public
     * @static
     * @description Intercepts right-clicks on the active graph and builds a floating DOM context menu.
     * @param {Core} cyInstance - Cytoscape Core instance.
     * @param {() => boolean} getIsDrillDown - Callback to evaluate if the canvas is in a drill down state.
     * @param {() => boolean} getIsViewerMode - Callback to evaluate if the canvas is in viewer mode.
     * @returns {void}
     */
    public static attach(viewId: string, cyInstance: Core, getIsDrillDown: () => boolean, getIsViewerMode: () => boolean): void {
        cyInstance.on('tap zoom pan', () => this.removeAll(viewId));

        cyInstance.on('cxttap', 'node', (evt: EventObject) => {
            this.removeAll(viewId); 
            
            const node = evt.target as NodeSingular;
            const container = cyInstance.container();
            if (!container) return;

            // SMART SELECTION EVALUATION
            // If the right-clicked node is part of a bulk selection, target the entire block.
            // Otherwise, Cytoscape treats the single 'node' as a collection of length 1.
            let targetNodes: NodeCollection = cyInstance.collection().merge(node);
            if (node.selected()) {
                const selectedNodes = cyInstance.nodes(':selected');
                if (selectedNodes.length > 1) {
                    targetNodes = selectedNodes;
                }
            }

            // ENTERPRISE UX: Glass Pane Protection
            // Invisible layer behind the menu that swallows missed clicks to prevent canvas deselection
            const glass = document.createElement("div");
            glass.id = `vdm-cy-glass-pane-${viewId}`;
            glass.style.position = "absolute";
            glass.style.top = "0";
            glass.style.left = "0";
            glass.style.width = "100%";
            glass.style.height = "100%";
            glass.style.zIndex = "9998"; 
            const blockEvent = (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                this.removeAll(viewId);
            };
            
            // Asynchronously bind glass pane events to prevent the initial native right-click 
            // bubbling phase from instantly destroying the newly created menu.
            requestAnimationFrame(() => {
                if (!document.getElementById(`vdm-cy-glass-pane-${viewId}`)) return;
                glass.onmousedown = blockEvent;
                glass.ontouchstart = blockEvent;
                glass.oncontextmenu = blockEvent;
            });
            container.appendChild(glass);

            const menu = this._buildMenuElement(viewId, evt.renderedPosition.x, evt.renderedPosition.y);
            
            const bIsNote = node.hasClass('annotation-note');
            if (bIsNote) {
                targetNodes = targetNodes.filter('.annotation-note');
            } else {
                targetNodes = targetNodes.difference('.annotation-note');
            }
            
            const totalCount = targetNodes.length;
            const suffix = totalCount > 1 ? ` (${totalCount})` : "";

            let strategy: BaseMenuStrategy;
            if (getIsViewerMode()) {
                strategy = new ViewerMenuStrategy(viewId);
            } else if (bIsNote) {
                this.removeAll(viewId); // No context menu for notes currently
                return;
            } else if (getIsDrillDown()) {
                strategy = new DrillDownMenuStrategy(viewId);
            } else {
                strategy = new BuilderEntityMenuStrategy(viewId);
            }
            strategy.build(menu, targetNodes, node, cyInstance, suffix, totalCount);

            if (menu.childNodes.length > 0) {
                container.appendChild(menu);
            } else {
                this.removeAll(viewId);
            }
        });
    }

    /**
     * @private
     * @static
     * @description Constructs the primary outer Fiori container representing the right-click menu block.
     * @param {number} x - Mouse Client X Coordinates via Cytoscape local rendering mapping.
     * @param {number} y - Mouse Client Y Coordinates via Cytoscape local rendering mapping.
     * @returns {HTMLDivElement} - The base Fiori-themed DIV Wrapper.
     */
    private static _buildMenuElement(viewId: string, x: number, y: number): HTMLDivElement {
        const menu = document.createElement("div");
        menu.id = `vdm-cy-context-menu-${viewId}`;
        menu.style.position = "absolute";
        menu.style.left = `${x + 10}px`;
        menu.style.top = `${y + 10}px`;
        menu.style.zIndex = "9999";
        menu.style.backgroundColor = "var(--sapBaseColor, #ffffff)";
        menu.style.border = "1px solid var(--sapContent_ForegroundBorderColor, #e5e5e5)";
        menu.style.borderRadius = "0.25rem";
        menu.style.boxShadow = "var(--sapContent_Shadow2, 0 0.125rem 0.5rem rgba(0, 0, 0, 0.15))";
        menu.style.padding = "0.25rem 0";
        menu.style.minWidth = "120px";
        menu.style.fontFamily = '"72", Arial, Helvetica, sans-serif';
        
        // Retain standard pointer blocking
        menu.onmousedown = (e) => e.stopPropagation();
        menu.ontouchstart = (e) => e.stopPropagation();
        menu.oncontextmenu = (e) => e.preventDefault();
        
        // FIX: Ensure the menu destroys itself after any valid click action inside of it.
        menu.onclick = () => this.removeAll(viewId);

        return menu;
    }
}