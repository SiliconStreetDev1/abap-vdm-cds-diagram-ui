/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.store.commands
 * @fileoverview Defines the base Command interface for the Undo/Redo stack.
 */

export interface ICommand {
    /**
     * Executes the command.
     */
    execute(): void;

    /**
     * Reverses the command.
     */
    undo(): void;
}
