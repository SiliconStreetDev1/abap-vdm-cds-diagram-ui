/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates Canvas interactions (Layout locking, Spacing, Minimap).
 * @description Removes direct UI5 model mutations and global DOM listeners from the Controller.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import ToggleButton from "sap/m/ToggleButton";
import EventBus from "sap/ui/core/EventBus";
import Renderer from "../renderer/Renderer";
import { EngineType } from "../types";
import { EventChannels, EventIds, DomEvents } from "../constants/EventConstants";

export default class CanvasActionHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _fnCloseMinimapRequestBind!: EventListener;
    private _fnLayoutUnlockedBind!: EventListener;

    constructor(oView: View, oEventBus?: EventBus) {
        this._oView = oView;
        this._oEventBus = oEventBus;
    }

    public attachEvents(): void {
        this._fnCloseMinimapRequestBind = this._onCloseMinimapRequest.bind(this) as EventListener;
        this._fnLayoutUnlockedBind = this._onLayoutUnlocked.bind(this) as EventListener;

        document.addEventListener(DomEvents.CLOSE_MINIMAP, this._fnCloseMinimapRequestBind);
        document.addEventListener(DomEvents.LAYOUT_UNLOCKED, this._fnLayoutUnlockedBind);
    }

    public detachEvents(): void {
        document.removeEventListener(DomEvents.CLOSE_MINIMAP, this._fnCloseMinimapRequestBind);
        document.removeEventListener(DomEvents.LAYOUT_UNLOCKED, this._fnLayoutUnlockedBind);
    }

    public toggleNodeLock(oEvent: Event): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const bPressed = !oViewModel.getProperty("/nodesLocked");
        oViewModel.setProperty("/nodesLocked", bPressed);
        
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        
        if (!bPressed) {
            if (oUiModel) oUiModel.setProperty("/formatCytoscape/presetPositions", null);
        } else {
            const oCanvasState = Renderer.getCanvasState(sEngine);
            if (oUiModel && oCanvasState) oUiModel.setProperty("/formatCytoscape/presetPositions", oCanvasState);
        }
        
        Renderer.setNodesLocked(sEngine, bPressed);
    }

    public relayout(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        oViewModel.setProperty("/nodesLocked", false);
        
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/formatCytoscape/presetPositions", null);
        
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.setNodesLocked(sEngine, false);
        Renderer.runLayout(sEngine);
    }

    public toggleMinimap(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        (this._oView.getModel("view") as JSONModel).setProperty("/showMinimap", bPressed);
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.toggleMinimap(sEngine, bPressed);
    }

    public changeSpacing(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel && this._oEventBus) {
            const oFormatConfig = Object.assign({}, oUiModel.getProperty("/formatCytoscape"));
            this._oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.LIVE_FORMAT_UPDATE, { engine: EngineType.CYTOSCAPE, format: oFormatConfig });
        }
    }

    private _onCloseMinimapRequest(): void {
        (this._oView.getModel("view") as JSONModel)?.setProperty("/showMinimap", false);
        Renderer.toggleMinimap((this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine"), false);
    }

    private _onLayoutUnlocked(): void {
        (this._oView.getModel("view") as JSONModel)?.setProperty("/nodesLocked", false);
        (this._oView.getModel("ui") as JSONModel)?.setProperty("/formatCytoscape/presetPositions", null);
    }
}