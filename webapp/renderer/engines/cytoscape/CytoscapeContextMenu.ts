/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Native Fiori Context Menu for Cytoscape.
 * @description Encapsulates the dynamic HTML construction for right-click node menus.
 */
import { DomEvents } from "../../../constants/EventConstants";

export default class CytoscapeContextMenu {

    /**
     * @public
     * @static
     * @description Intercepts right-clicks on the active graph and builds a floating DOM context menu.
     * @param {any} cyInstance - Cytoscape Core instance.
     * @returns {void}
     */
    public static attach(cyInstance: any): void {
        const removeMenu = () => {
            const existing = document.getElementById("vdm-cy-context-menu");
            if (existing) existing.remove();
            const glass = document.getElementById("vdm-cy-glass-pane");
            if (glass) glass.remove();
        };

        cyInstance.on('tap zoom pan', removeMenu);

        cyInstance.on('cxttap', 'node', (evt: any) => {
            removeMenu(); 
            
            const node = evt.target;
            const container = cyInstance.container();
            if (!container) return;

            // SMART SELECTION EVALUATION
            // If the right-clicked node is part of a bulk selection, target the entire block.
            // Otherwise, Cytoscape treats the single 'node' as a collection of length 1.
            let targetNodes = node;
            if (node.selected()) {
                const selectedNodes = cyInstance.nodes(':selected');
                if (selectedNodes.length > 1) {
                    targetNodes = selectedNodes;
                }
            }

            // ENTERPRISE UX: Glass Pane Protection
            // Invisible layer behind the menu that swallows missed clicks to prevent canvas deselection
            const glass = document.createElement("div");
            glass.id = "vdm-cy-glass-pane";
            glass.style.position = "absolute";
            glass.style.top = "0";
            glass.style.left = "0";
            glass.style.width = "100%";
            glass.style.height = "100%";
            glass.style.zIndex = "9998"; 
            const blockEvent = (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
                removeMenu();
            };
            
            // Prevent the native browser contextmenu event from instantly triggering the glass pane
            setTimeout(() => {
                if (!document.getElementById("vdm-cy-glass-pane")) return;
                glass.onmousedown = blockEvent;
                glass.ontouchstart = blockEvent;
                glass.oncontextmenu = blockEvent;
            }, 50);
            container.appendChild(glass);

            const menu = this._buildMenuElement(evt.renderedPosition.x, evt.renderedPosition.y);
            
            const totalCount = targetNodes.length;
            const lockedCount = targetNodes.filter(':locked').length;
            const suffix = totalCount > 1 ? ` (${totalCount})` : "";

            // Render 'Pin' if ANY nodes in the selection are currently unlocked
            if (lockedCount < totalCount) {
                menu.appendChild(this._createMenuItem("📌", `Pin${suffix}`, "#d32f2f", () => {
                    targetNodes.data('isPinned', true).lock();
                    document.dispatchEvent(new CustomEvent(DomEvents.NODE_PINNED, {}));
                }));
            } 
            
            // Render 'Unlock' if ANY nodes in the selection are currently locked
            if (lockedCount > 0) {
                menu.appendChild(this._createMenuItem("🔓", `Unlock${suffix}`, "#4caf50", () => {
                    targetNodes.data('isPinned', false).unlock();
                    document.dispatchEvent(new CustomEvent(DomEvents.NODE_PINNED, {})); // Triggers dirty state
                }));
            }

            menu.appendChild(this._createMenuItem("✖", `Hide${suffix}`, "#333333", () => {
                // Hiding a node must instantly sever its selection state to clear Focus Mode ghosts
                targetNodes.addClass('hidden').data('isHidden', true).unselect();
                document.dispatchEvent(new CustomEvent(DomEvents.NODE_HIDDEN, {}));
                document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { hasHidden: true } }));
            }));

            container.appendChild(menu);
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
    private static _buildMenuElement(x: number, y: number): HTMLDivElement {
        const menu = document.createElement("div");
        menu.id = "vdm-cy-context-menu";
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
        menu.onmousedown = (e) => e.stopPropagation();
        menu.ontouchstart = (e) => e.stopPropagation();
        menu.oncontextmenu = (e) => e.preventDefault();
        return menu;
    }

    /**
     * @private
     * @static
     * @description Stitches and wires Fiori-themed clickable interaction row units.
     * @param {string} icon - Native OS string literal character or emoji to use for semantic identification.
     * @param {string} text - Standard textual label.
     * @param {string} color - Semantic Fiori CSS text color.
     * @param {Function} onClick - Action trigger callback mapping back to Cytoscape.
     * @returns {HTMLDivElement} - Styled interactive interaction tier element.
     */
    private static _createMenuItem(icon: string, text: string, color: string, onClick: () => void): HTMLDivElement {
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
            const existing = document.getElementById("vdm-cy-context-menu");
            if (existing) existing.remove();
        };
        item.onmousedown = fireAction;
        item.ontouchstart = fireAction;

        return item;
    }
}