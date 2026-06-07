/**
 * @fileoverview Active Builder Keyboard Strategy.
 * @description Enables full structural modification, destructive actions, and metadata annotation.
 */
import ViewerKeyboardStrategy from "./ViewerKeyboardStrategy";
import { EventManager } from "../../events/EventManager";
import JSONModel from "sap/ui/model/json/JSONModel";
import Renderer from "../../renderer/Renderer";
import { UiState, ViewState, DiagramData } from "../../constants/StateConstants";

/**
 * @class BuilderKeyboardStrategy
 * @description Active Builder Keyboard Strategy. Enables full structural modification, destructive actions, and metadata annotation.
 */
export default class BuilderKeyboardStrategy extends ViewerKeyboardStrategy {
    
    /**
     * @public
     * @description Maps structural editing shortcuts (undo, add note, delete) on top of inherited viewer interactions.
     * @param {KeyboardEvent} e - Global keydown event.
     * @param {boolean} bIsTyping - Flag indicating if the user is typing in a text field.
     */
    public mapShortcuts(e: KeyboardEvent, bIsTyping: boolean): void {
        const bCtrl = e.ctrlKey || e.metaKey;
        const bShift = e.shiftKey;
        const sKey = e.key ? e.key.toLowerCase() : "";
        const sRawKey = e.key || "";

        if (bIsTyping) return;

        // Inherit baseline viewer navigation capabilities
        super.mapShortcuts(e, bIsTyping);

        if (bCtrl && !bShift && !e.altKey) {
            if (sKey === "z") { e.preventDefault(); EventManager.getInstance().publish("canvas:undoRequest", { viewId: this._getInstanceId() }); return; }
        }

        if (bShift && !bCtrl && !e.altKey) {
            if (sKey === "n") { e.preventDefault(); this._addNote(); return; }
            if (sKey === "t") { e.preventDefault(); this._toggleTempFocus(); return; }
        }

        if (!bCtrl && !bShift && !e.altKey) {
            if (sRawKey === "Delete" || sRawKey === "Backspace") { e.preventDefault(); this._deleteSelection(); return; }
        }
    }

    /**
     * @private
     * @description Opens the dialog prompt to add a new Sticky Note to the canvas.
     */
    private _addNote(): void {
        const uiModel = this._oView.getModel("ui") as JSONModel;
        if (uiModel && !uiModel.getProperty(UiState.IS_DRILL_DOWN)) EventManager.getInstance().publish("canvas:promptAddNoteRequest", { viewId: this._getInstanceId() });
    }

    /**
     * @private
     * @description Activates or deactivates the temporary Focus Mode on the currently selected node.
     */
    private _toggleTempFocus(): void {
        const uiModel = this._oView.getModel("ui") as JSONModel;
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && uiModel && oViewModel.getProperty(ViewState.HAS_NODE_SELECTED) && !uiModel.getProperty("/formatCytoscape/enableFocusMode")) {
            const bCurrentFocus = oViewModel.getProperty(ViewState.TEMP_FOCUS_MODE);
            oViewModel.setProperty(ViewState.TEMP_FOCUS_MODE, !bCurrentFocus);
            const engineId = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
            Renderer.setTempFocusMode(this._getInstanceId(), engineId, !bCurrentFocus);
        }
    }
}