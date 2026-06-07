/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace.menu
 * @fileoverview Active builder context menu strategy.
 * @description Permits full destructive and constructive actions for architectural entities.
 */
import type { Core, NodeCollection, NodeSingular } from "cytoscape";
import BaseMenuStrategy from "./BaseMenuStrategy";
import { EventManager } from "../../../../events/EventManager";

export default class BuilderEntityMenuStrategy extends BaseMenuStrategy {

   

    /**
     * @public
     * @description Executes build functionality.
     */
    public build(menu: HTMLDivElement, targetNodes: NodeCollection, clickedNode: NodeSingular, cyInstance: Core, suffix: string, totalCount: number): void {
        menu.appendChild(this._createMenuItem("📝", `Add Linked Note${suffix}`, "#f57c00", () => {
            // FIX: Instantly destroy the menu and glass pane before firing the background event
            this._closeMenu();

            cyInstance.elements().unselect();
            targetNodes.select();
            EventManager.getInstance().publish("canvas:promptAddNoteRequest", { viewId: this._viewId });
        }));

        // Compose standard Pin/Hide commands
        // Note: If the buttons inside this method also hang, you will need to add this._closeMenu() to their click handlers inside BaseMenuStrategy as well.
        this._buildExplorationTools(menu, targetNodes, cyInstance, suffix, totalCount);
    }
}