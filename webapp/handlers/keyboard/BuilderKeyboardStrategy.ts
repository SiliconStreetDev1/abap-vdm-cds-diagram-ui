/**
 * @fileoverview Active Builder Keyboard Strategy.
 * @description Enables full structural modification, destructive actions, and metadata annotation.
 */
import ViewerKeyboardStrategy from "./ViewerKeyboardStrategy";
import { EventManager } from "../../events/EventManager";
import JSONModel from "sap/ui/model/json/JSONModel";
import Renderer from "../../renderer/Renderer";
import { UiState, ViewState, DiagramData } from "../../constants/StateConstants";

export default class BuilderKeyboardStrategy extends ViewerKeyboardStrategy {
    
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
    }

    private _addNote(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel && !oUiModel.getProperty(UiState.IS_DRILL_DOWN)) EventManager.getInstance().publish("canvas:promptAddNoteRequest", { viewId: this._getInstanceId() });
    }

    private _toggleTempFocus(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oUiModel && oViewModel.getProperty(ViewState.HAS_NODE_SELECTED) && !oUiModel.getProperty("/formatCytoscape/enableFocusMode")) {
            const bCurrentFocus = oViewModel.getProperty(ViewState.TEMP_FOCUS_MODE);
            oViewModel.setProperty(ViewState.TEMP_FOCUS_MODE, !bCurrentFocus);
            const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
            Renderer.setTempFocusMode(this._getInstanceId(), sEngine, !bCurrentFocus);
        }
    }
}