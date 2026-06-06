import { ICommand } from "./ICommand";
import { DiagramStateStore, IPosition } from "../DiagramStateStore";
import Renderer from "../../renderer/Renderer";

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

    public execute(): void {
        this.nodes.forEach(n => {
            DiagramStateStore.getInstance().setNodeState(this.viewId, this.diagramId, n.nodeId, { position: n.newPos });
            Renderer.moveNode(this.viewId, this._engine, n.nodeId, n.newPos);
        });
    }

    public undo(): void {
        this.nodes.forEach(n => {
            DiagramStateStore.getInstance().setNodeState(this.viewId, this.diagramId, n.nodeId, { position: n.oldPos });
            Renderer.moveNode(this.viewId, this._engine, n.nodeId, n.oldPos);
        });
    }
}
