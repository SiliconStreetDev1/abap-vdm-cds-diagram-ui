import { ICommand } from "./ICommand";
import Renderer from "../../renderer/Renderer";

export class AddNoteCommand implements ICommand {
    public viewId: string;
    public diagramId: string;
    private _engine: string;
    private text: string;
    private noteJson: any;
    private isFirstRun: boolean = true;

    constructor(
        viewId: string,
        diagramId: string,
        noteJson: any,
        engine: string
    ) {
        this.viewId = viewId;
        this.diagramId = diagramId;
        this.noteJson = noteJson;
        this._engine = engine;
    }

    public execute(): void {
        if (this.isFirstRun) {
            this.isFirstRun = false;
            // Creation already handled by Renderer prior to command generation
        } else {
            Renderer.restoreSelection(this.viewId, this._engine, this.noteJson, []);
        }
    }

    public undo(): void {
        if (this.noteJson) {
            Renderer.deleteSpecificElements(this.viewId, this._engine, this.noteJson, []);
        }
    }
}
