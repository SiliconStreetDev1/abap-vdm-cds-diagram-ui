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
    private _engine: string;

    constructor(viewId: string, diagramId: string, nodeId: string, oldPos: IPosition, newPos: IPosition, engine: string) {
        this._viewId = viewId;
        this._diagramId = diagramId;
        this._nodeId = nodeId;
        this._oldPos = oldPos;
        this._newPos = newPos;
        this._engine = engine;
    }

    /**
     * @public
     * @description Executes execute functionality.
     */
    public execute(): void {
        DiagramStateStore.getInstance().setNodeState(this._viewId, this._diagramId, this._nodeId, { position: this._newPos });
        
        // Push visual update to specific engine immediately bypassing full rerender
        Renderer.moveNode(this._viewId, this._engine, this._nodeId, this._newPos);
    }

    /**
     * @public
     * @description Executes undo functionality.
     */
    public undo(): void {
        DiagramStateStore.getInstance().setNodeState(this._viewId, this._diagramId, this._nodeId, { position: this._oldPos });
        
        // Push visual update to specific engine immediately bypassing full rerender
        Renderer.moveNode(this._viewId, this._engine, this._nodeId, this._oldPos);
    }
}
