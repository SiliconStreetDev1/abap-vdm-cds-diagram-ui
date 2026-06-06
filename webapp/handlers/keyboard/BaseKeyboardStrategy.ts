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

/**
 * @class BaseKeyboardStrategy
 * @description Defines the polymorphic contract for shortcut mapping and encapsulates
 * shared canvas execution commands (Panning, Selection, Minimap) used by all modes.
 */
export default abstract class BaseKeyboardStrategy {
    protected _oView: View;

    /**
     * @constructor
     * @param {View} oView - Reference to the active UI5 view.
     */
    constructor(oView: View) {
        this._oView = oView;
    }

    /**
     * @protected
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    protected _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    /**
     * @public
     * @abstract
     * @description Core mapping function overridden by concrete Viewer/Builder strategies.
     * @param {KeyboardEvent} e - Global keydown event.
     * @param {boolean} bIsTyping - Flag indicating if the user is typing in a text field.
     */
    public abstract mapShortcuts(e: KeyboardEvent, bIsTyping: boolean): void;

    /**
     * @public
     * @description Switches the active interaction mode (e.g. Selection vs Panning).
     * @param {"pan" | "select"} sMode - Interaction mode identifier.
     */
    public setMode(sMode: "pan" | "select"): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty(ViewState.IS_SELECT_MODE, sMode === "select");
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.setInteractionMode(this._getInstanceId(), sEngine, sMode);
    }

    /**
     * @protected
     * @description Drops all current selections from the canvas.
     */
    protected _clearSelection(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.clearSelection(this._getInstanceId(), sEngine);
    }

    /**
     * @protected
     * @description Selects all interactable entities on the canvas.
     */
    protected _selectAll(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.selectAll(this._getInstanceId(), sEngine);
    }

    /**
     * @protected
     * @description Toggles the visibility of the Cytoscape Minimap overlay.
     */
    protected _toggleMinimap(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty(ViewState.HAS_DIAGRAM) && oViewModel.getProperty(ViewState.CAN_SHOW_MINIMAP)) {
            const bShow = !oViewModel.getProperty(ViewState.SHOW_MINIMAP);
            oViewModel.setProperty(ViewState.SHOW_MINIMAP, bShow);
            const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
            Renderer.toggleMinimap(this._getInstanceId(), sEngine, bShow);
        }
    }

    /**
     * @protected
     * @description Handles removal of selected entities from the canvas. 
     * Propagates a deletion request to the EventManager for State tracking.
     */
    protected _deleteSelection(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE);
        Renderer.deleteSelection(this._getInstanceId(), sEngine);
        EventManager.getInstance().publish("canvas:deleteSelectionRequest", { viewId: this._getInstanceId() });
    }

    /**
     * @protected
     * @description Opens the Hidden Nodes dialog if hidden nodes exist in the current layout.
     */
    protected _toggleHidden(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty(ViewState.HAS_HIDDEN_NODES)) {
            const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
            if (oDialog) oDialog.open();
        }
    }
}