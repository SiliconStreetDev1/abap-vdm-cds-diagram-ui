/**
 * @fileoverview Abstract Base Strategy for Keyboard Shortcuts.
 * @description Defines the polymorphic contract for shortcut mapping and encapsulates
 * shared canvas execution commands (Panning, Selection, Minimap) used by all modes.
 */
import { EventManager } from "../../events/EventManager";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import Renderer from "../../renderer/Renderer";
import { ViewState, DiagramData } from "../../constants/StateConstants";

export default abstract class BaseKeyboardStrategy {
    protected _oView: View;

    constructor(oView: View) {
        this._oView = oView;
    }

    protected _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    public abstract mapShortcuts(e: KeyboardEvent, bIsTyping: boolean): void;

    public setMode(sMode: "pan" | "select"): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty(ViewState.IS_SELECT_MODE, sMode === "select");
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.setInteractionMode(this._getInstanceId(), sEngine, sMode);
    }

    protected _dispatch(sEventId: string): void {
        if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(sEventId, { detail: { viewId: this._getInstanceId() } }));
    }

    protected _clearSelection(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.clearSelection(this._getInstanceId(), sEngine);
    }

    protected _selectAll(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.selectAll(this._getInstanceId(), sEngine);
    }

    protected _toggleMinimap(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty(ViewState.HAS_DIAGRAM) && oViewModel.getProperty(ViewState.CAN_SHOW_MINIMAP)) {
            const bShow = !oViewModel.getProperty(ViewState.SHOW_MINIMAP);
            oViewModel.setProperty(ViewState.SHOW_MINIMAP, bShow);
            const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
            Renderer.toggleMinimap(this._getInstanceId(), sEngine, bShow);
        }
    }

    protected _deleteSelection(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.deleteSelection(this._getInstanceId(), sEngine);
        EventManager.getInstance().publish("canvas:deleteSelectionRequest", { viewId: this._getInstanceId() });
    }

    protected _toggleHidden(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty(ViewState.HAS_HIDDEN_NODES)) {
            const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
            if (oDialog) oDialog.open();
        }
    }
}