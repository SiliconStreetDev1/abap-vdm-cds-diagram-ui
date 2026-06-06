/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.store
 * @fileoverview Manages execution and history (Undo/Redo stacks) of commands.
 */

import { ICommand } from "./commands/ICommand";
import { EventManager } from "../events/EventManager";

export class CommandManager {
    private _undoStack: ICommand[] = [];
    private _redoStack: ICommand[] = [];
    private _maxLimit: number = 25;
    private _viewId: string;

    constructor(viewId: string) {
        this._viewId = viewId;
    }

    /**
     * @public
     * @description Executes a new command and pushes it to the undo stack.
     */
    public execute(command: ICommand): void {
        command.execute();
        this._undoStack.push(command);
        
        if (this._undoStack.length > this._maxLimit) {
            this._undoStack.shift();
        }

        // A new action invalidates any redos
        this._redoStack = [];
    }

    /**
     * @public
     * @description Reverses the last executed command.
     */
    public undo(): void {
        if (this._undoStack.length === 0) return;

        const command = this._undoStack.pop();
        if (command) {
            command.undo();
            this._redoStack.push(command);
            
            // Trigger a render update to UI listeners
            EventManager.getInstance().publish("diagram:liveFormatUpdate", { engine: "cytoscape", format: {} }); // Notify UI or Canvas
        }
    }

    /**
     * @public
     * @description Re-applies a previously undone command.
     */
    public redo(): void {
        if (this._redoStack.length === 0) return;

        const command = this._redoStack.pop();
        if (command) {
            command.execute();
            this._undoStack.push(command);
            
            // Trigger a render update to UI listeners
            EventManager.getInstance().publish("diagram:liveFormatUpdate", { engine: "cytoscape", format: {} });
        }
    }

    /**
     * @public
     * @description Flushes the history stacks completely.
     */
    public clear(): void {
        this._undoStack = [];
        this._redoStack = [];
    }
}
