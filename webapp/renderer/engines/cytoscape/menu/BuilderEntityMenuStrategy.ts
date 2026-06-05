/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace.menu
 * @fileoverview Active builder context menu strategy.
 * @description Permits full destructive and constructive actions for architectural entities.
 */
import type { Core, NodeCollection, NodeSingular } from "cytoscape";
import BaseMenuStrategy from "./BaseMenuStrategy";
import { DomEvents } from "../../../../constants/EventConstants";

export default class BuilderEntityMenuStrategy extends BaseMenuStrategy {
    public build(menu: HTMLDivElement, targetNodes: NodeCollection, clickedNode: NodeSingular, cyInstance: Core, suffix: string, totalCount: number): void {
        menu.appendChild(this._createMenuItem("📝", `Add Linked Note${suffix}`, "#f57c00", () => {
            cyInstance.elements().unselect();
            targetNodes.select();
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.PROMPT_ADD_NOTE_REQUEST, { detail: { viewId: this._sViewId } }));
        }));

        // Compose standard Pin/Hide commands
        this._buildExplorationTools(menu, targetNodes, cyInstance, suffix, totalCount);
    }
}