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
     * @description Safely removes any active context menu and glass pane from the DOM.
     */
    public static removeAll(): void {
        const existing = document.getElementById("vdm-cy-context-menu");
        if (existing) existing.remove();
        const glass = document.getElementById("vdm-cy-glass-pane");
        if (glass) glass.remove();
    }

    /**
     * @public
     * @static
     * @description Intercepts right-clicks on the active graph and builds a floating DOM context menu.
     * @param {any} cyInstance - Cytoscape Core instance.
     * @returns {void}
     */
    public static attach(cyInstance: any): void {
        cyInstance.on('tap zoom pan', () => this.removeAll());

        cyInstance.on('cxttap', 'node', (evt: any) => {
            this.removeAll(); 
            
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
                this.removeAll();
            };
            
            // Asynchronously bind glass pane events to prevent the initial native right-click 
            // bubbling phase from instantly destroying the newly created menu.
            setTimeout(() => {
                if (!document.getElementById("vdm-cy-glass-pane")) return;
                glass.onmousedown = blockEvent;
                glass.ontouchstart = blockEvent;
                glass.oncontextmenu = blockEvent;
            }, 0);
            container.appendChild(glass);

            const menu = this._buildMenuElement(evt.renderedPosition.x, evt.renderedPosition.y);
            
            const bIsNote = node.hasClass('annotation-note');
            if (bIsNote) {
                targetNodes = targetNodes.filter('.annotation-note');
            } else {
                targetNodes = targetNodes.difference('.annotation-note');
            }
            
            const totalCount = targetNodes.length;
            const suffix = totalCount > 1 ? ` (${totalCount})` : "";
            const bIsDrillDown = cyInstance.scratch('_isDrillDown') === true;

            if (bIsNote) {
                if (!bIsDrillDown) {
                    this._buildNoteMenu(menu, targetNodes, node, cyInstance, suffix);
                }
            } else {
                this._buildEntityMenu(menu, targetNodes, cyInstance, suffix, totalCount);
            }

            if (menu.childNodes.length > 0) {
                container.appendChild(menu);
            } else {
                this.removeAll();
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
     * @description Builds the context menu items specific to annotation notes.
     * @param {HTMLDivElement} menu - The DOM container for the menu.
     * @param {any} targetNodes - The collection of Cytoscape nodes to operate on.
     * @param {any} clickedNode - The specific node that was right-clicked.
     * @param {any} cyInstance - The Cytoscape graph instance.
     * @param {string} suffix - Formatting string (e.g. "(3)") for bulk selections.
     * @returns {void}
     */
    private static _buildNoteMenu(menu: HTMLDivElement, targetNodes: any, clickedNode: any, cyInstance: any, suffix: string): void {
        menu.appendChild(this._createMenuItem("✏️", `Edit Note${suffix}`, "#f57c00", () => {
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.PROMPT_EDIT_NOTE_REQUEST, { detail: { id: clickedNode.id(), text: clickedNode.data('label'), fontFamily: clickedNode.data('fontFamily') } }));
        }));

        const selectedEntities = cyInstance.nodes(':selected').difference('.annotation-note');
        if (selectedEntities.length > 0) {
            menu.appendChild(this._createMenuItem("🔗", `Link to Selected (${selectedEntities.length})`, "#0070f2", () => {
                targetNodes.forEach((n: any) => {
                    selectedEntities.forEach((e: any) => {
                        const edgeId = 'edge_' + n.id() + '_' + e.id();
                        if (cyInstance.getElementById(edgeId).length === 0) {
                            cyInstance.add({ group: 'edges', data: { id: edgeId, source: n.id(), target: e.id() }, classes: 'annotation-edge' });
                        }
                    });
                });
                if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, {}));
            }));
        }
        menu.appendChild(this._createMenuItem("✂️", `Unlink${suffix}`, "#d32f2f", () => {
            targetNodes.connectedEdges('.annotation-edge').remove();
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, {}));
        }));
        menu.appendChild(this._createMenuItem("🗑️", `Delete Note${suffix}`, "#d32f2f", () => {
            targetNodes.remove();
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, {}));
        }));
        
        menu.appendChild(document.createElement("hr")).style.cssText = "margin: 0.25rem 0; border: none; border-top: 1px solid var(--sapContent_ForegroundBorderColor, #e5e5e5);";

        menu.appendChild(this._createMenuItem("🟡", `Yellow${suffix}`, "#fbc02d", () => { targetNodes.forEach((n: any) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { id: n.id(), bgColor: '#fff9c4', borderColor: '#fbc02d' } }))); }));
        menu.appendChild(this._createMenuItem("🔵", `Blue${suffix}`, "#1976d2", () => { targetNodes.forEach((n: any) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { id: n.id(), bgColor: '#e3f2fd', borderColor: '#1976d2' } }))); }));
        menu.appendChild(this._createMenuItem("🟢", `Green${suffix}`, "#388e3c", () => { targetNodes.forEach((n: any) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { id: n.id(), bgColor: '#e8f5e9', borderColor: '#388e3c' } }))); }));
        menu.appendChild(this._createMenuItem("🔴", `Pink${suffix}`, "#d32f2f", () => { targetNodes.forEach((n: any) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { id: n.id(), bgColor: '#ffebee', borderColor: '#d32f2f' } }))); }));
    }

    /**
     * @private
     * @static
     * @description Builds the context menu items specific to structural CDS entities.
     * @param {HTMLDivElement} menu - The DOM container for the menu.
     * @param {any} targetNodes - The collection of Cytoscape nodes to operate on.
     * @param {any} cyInstance - The Cytoscape graph instance.
     * @param {string} suffix - Formatting string (e.g. "(3)") for bulk selections.
     * @param {number} totalCount - Total number of nodes in selection.
     * @returns {void}
     */
    private static _buildEntityMenu(menu: HTMLDivElement, targetNodes: any, cyInstance: any, suffix: string, totalCount: number): void {
        const bIsDrillDown = cyInstance.scratch('_isDrillDown') === true;

        if (!bIsDrillDown) {
            menu.appendChild(this._createMenuItem("📝", `Add Linked Note${suffix}`, "#f57c00", () => {
                cyInstance.elements().unselect();
                targetNodes.select();
                if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.PROMPT_ADD_NOTE_REQUEST, {}));
            }));
        }

        const lockedCount = targetNodes.filter(':locked').length;
        if (lockedCount < totalCount) {
            menu.appendChild(this._createMenuItem("📌", `Pin${suffix}`, "#d32f2f", () => { targetNodes.data('isPinned', true).lock(); document.dispatchEvent(new CustomEvent(DomEvents.NODE_PINNED, {})); }));
        } 
        if (lockedCount > 0) {
            menu.appendChild(this._createMenuItem("🔓", `Unlock${suffix}`, "#4caf50", () => { targetNodes.data('isPinned', false).unlock(); document.dispatchEvent(new CustomEvent(DomEvents.NODE_PINNED, {})); }));
        }
        menu.appendChild(this._createMenuItem("✖", `Hide${suffix}`, "#333333", () => {
            targetNodes.addClass('hidden').data('isHidden', true).unselect();
            document.dispatchEvent(new CustomEvent(DomEvents.NODE_HIDDEN, {}));
            document.dispatchEvent(new CustomEvent(DomEvents.NODES_VISIBILITY_CHANGED, { detail: { hasHidden: true } }));
        }));
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
            this.removeAll();
        };
        item.onmousedown = fireAction;
        item.ontouchstart = fireAction;

        return item;
    }
}