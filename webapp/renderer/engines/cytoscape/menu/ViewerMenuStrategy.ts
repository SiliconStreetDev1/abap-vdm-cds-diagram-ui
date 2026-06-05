/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace.menu
 * @fileoverview Viewer context menu strategy.
 * @description Enforces strict read-only mode by rendering absolutely no context menu items.
 */
import type { Core, NodeCollection, NodeSingular } from "cytoscape";
import BaseMenuStrategy from "./BaseMenuStrategy";

export default class ViewerMenuStrategy extends BaseMenuStrategy {
    public build(menu: HTMLDivElement, targetNodes: NodeCollection, clickedNode: NodeSingular, cyInstance: Core, suffix: string, totalCount: number): void {
        // Enterprise UX: Compose non-destructive exploration tools (Pin, Unlock, Hide)
        this._buildExplorationTools(menu, targetNodes, cyInstance, suffix, totalCount);
    }
}