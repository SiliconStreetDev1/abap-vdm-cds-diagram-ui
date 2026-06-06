/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.store.commands
 * @fileoverview Reverses and reapplies node position deltas.
 */

import { ICommand } from "./ICommand";
import { DiagramStateStore, IPosition } from "../DiagramStateStore";
import Renderer from "../../renderer/Renderer";

export class MoveNodeCommand implements ICommand {
    private _viewId: string;
    private _diagramId: string;
    private _nodeId: string;
    private _oldPos: IPosition;
    private _newPos: IPosition;

    constructor(viewId: string, diagramId: string, nodeId: string, oldPos: IPosition, newPos: IPosition) {
        this._viewId = viewId;
        this._diagramId = diagramId;
        this._nodeId = nodeId;
        this._oldPos = oldPos;
        this._newPos = newPos;
    }

    public execute(): void {
        DiagramStateStore.getInstance().setNodeState(this._viewId, this._diagramId, this._nodeId, { position: this._newPos });
        
        // Push visual update to Cytoscape engine immediately bypassing full rerender
        Renderer.moveNode(this._viewId, "cytoscape", this._nodeId, this._newPos);
    }

    public undo(): void {
        DiagramStateStore.getInstance().setNodeState(this._viewId, this._diagramId, this._nodeId, { position: this._oldPos });
        
        // Push visual update to Cytoscape engine immediately bypassing full rerender
        Renderer.moveNode(this._viewId, "cytoscape", this._nodeId, this._oldPos);
    }
}
