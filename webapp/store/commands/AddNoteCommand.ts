import { ICommand } from "./ICommand";
import Renderer from "../../renderer/Renderer";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.store.commands
 * @class AddNoteCommand
 * @description Enterprise definition for AddNoteCommand.
 */
export class AddNoteCommand implements ICommand {
    public viewId: string;
    public diagramId: string;
    public engine: string;
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
        this.engine = engine;
    }

    /**
     * @public
     * @description Executes execute functionality.
     */
    public execute(): void {
        if (this.isFirstRun) {
            this.isFirstRun = false;
            // Creation already handled by Renderer prior to command generation
        } else {
            Renderer.restoreSelection(this.viewId, this.engine, this.noteJson, []);
        }
    }

    /**
     * @public
     * @description Executes undo functionality.
     */
    public undo(): void {
        if (this.noteJson) {
            Renderer.deleteSpecificElements(this.viewId, this.engine, this.noteJson, []);
        }
    }
}
