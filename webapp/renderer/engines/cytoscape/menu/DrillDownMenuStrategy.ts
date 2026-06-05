/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace.menu
 * @fileoverview Drill-Down context menu strategy.
 * @description Permits non-destructive view layout management (pinning, hiding).
 */
import type { Core, NodeCollection, NodeSingular } from "cytoscape";
import BaseMenuStrategy from "./BaseMenuStrategy";

export default class DrillDownMenuStrategy extends BaseMenuStrategy {
    public build(menu: HTMLDivElement, targetNodes: NodeCollection, clickedNode: NodeSingular, cyInstance: Core, suffix: string, totalCount: number): void {
        this._buildExplorationTools(menu, targetNodes, cyInstance, suffix, totalCount);
    }
}