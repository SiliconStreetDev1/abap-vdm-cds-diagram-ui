import { ICommand } from "./ICommand";
import Renderer from "../../renderer/Renderer";

export class DeleteSelectionCommand implements ICommand {
    public viewId: string;
    public diagramId: string;
    private _engine: string;
    private notesJson: any;
    private hiddenNodeIds: string[];
    private isFirstRun: boolean = true;

    constructor(
        viewId: string,
        diagramId: string,
        notesJson: any,
        hiddenNodeIds: string[],
        engine: string
    ) {
        this.viewId = viewId;
        this.diagramId = diagramId;
        this.notesJson = notesJson;
        this.hiddenNodeIds = hiddenNodeIds;
        this._engine = engine;
    }

    public execute(): void {
        if (this.isFirstRun) {
            this.isFirstRun = false;
            return;
        }
        Renderer.deleteSpecificElements(this.viewId, this._engine, this.notesJson, this.hiddenNodeIds);
    }

    public undo(): void {
        Renderer.restoreSelection(this.viewId, this._engine, this.notesJson, this.hiddenNodeIds);
    }
}
