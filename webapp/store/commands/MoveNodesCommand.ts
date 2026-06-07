import { ICommand } from "./ICommand";
import { DiagramStateStore, IPosition } from "../DiagramStateStore";
import Renderer from "../../renderer/Renderer";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.store.commands
 * @class MoveNodesCommand
 * @description Enterprise definition for MoveNodesCommand.
 */
export class MoveNodesCommand implements ICommand {
    public viewId: string;
    public diagramId: string;
    private _engine: string;
    private nodes: { nodeId: string; oldPos: { x: number; y: number }; newPos: { x: number; y: number } }[];

    constructor(
        viewId: string,
        diagramId: string,
        nodes: { nodeId: string; oldPos: { x: number; y: number }; newPos: { x: number; y: number } }[],
        engine: string
    ) {
        this.viewId = viewId;
        this.diagramId = diagramId;
        this.nodes = nodes;
        this._engine = engine;
    }

    /**
     * @public
     * @description Executes execute functionality.
     */
    public execute(): void {
        const stateUpdates = this.nodes.map(n => ({ nodeId: n.nodeId, stateUpdate: { position: n.newPos } }));
        DiagramStateStore.getInstance().setNodeStates(this.viewId, this.diagramId, stateUpdates);
        
        const movePayload = this.nodes.map(n => ({ nodeId: n.nodeId, position: n.newPos }));
        Renderer.moveNodes(this.viewId, this._engine, movePayload);
    }

    /**
     * @public
     * @description Executes undo functionality.
     */
    public undo(): void {
        const stateUpdates = this.nodes.map(n => ({ nodeId: n.nodeId, stateUpdate: { position: n.oldPos } }));
        DiagramStateStore.getInstance().setNodeStates(this.viewId, this.diagramId, stateUpdates);
        
        const movePayload = this.nodes.map(n => ({ nodeId: n.nodeId, position: n.oldPos }));
        Renderer.moveNodes(this.viewId, this._engine, movePayload);
    }
}
