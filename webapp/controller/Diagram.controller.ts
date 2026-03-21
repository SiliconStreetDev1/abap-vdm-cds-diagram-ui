/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Standalone Canvas Controller.
 * @version 2.3
 * @description Subscribes to the EventBus to receive payload data, renders it, 
 * and delegates all download actions to the ExportHandler.
 */

import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import HTML from "sap/ui/core/HTML";

import ExportHandler from "./ExportHandler";
import Renderer from "../renderer/Renderer";

export default class Diagram extends Controller {
    
    /** @private {ExportHandler} Manages saving the canvas to disk/clipboard */
    private _oExportHandler!: ExportHandler;

    /**
     * @public
     * @description Initializes models and subscribes to EventBus.
     * @returns {void}
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        // Local UI state model
        oView.setModel(new JSONModel({ 
            hasDiagram: false, 
            hasError: false, 
            errorText: "", 
            canExportImg: true 
        }), "view");
        
        // Local data storage for the ExportHandler
        oView.setModel(new JSONModel({ 
            payload: "", 
            extension: "", 
            cdsName: "", 
            engine: "" 
        }), "diagramData");

        this._oExportHandler = new ExportHandler(oView, this._getText.bind(this), this._showError.bind(this));

        const oEventBus = this.getOwnerComponent()?.getEventBus();
        if (oEventBus) {
            oEventBus.subscribe("DiagramEngine", "RenderRequest", this._onRenderRequest, this);
        }
    }

    /**
     * @private
     * @description Renders the diagram payload received from the Selection controller.
     */
    private _onRenderRequest(sChannel: string, sEvent: string, oData: any): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        const oDataModel = this.getView()?.getModel("diagramData") as JSONModel;

        this._resetState();

        // Hydrate local data model so exports work correctly
        oDataModel.setData({
            payload: oData.payload,
            extension: oData.extension,
            cdsName: oData.cdsName,
            engine: oData.engine
        });

        if (oData.engine === "D2") {
            this._showError("msgD2Warning");
            return;
        }

        // FIX: Update UI state (make toolbar visible) BEFORE calling the Renderer.
        // This ensures the buttons don't stay hidden if the rendering engine has a hiccup.
        oViewModel.setProperty("/canExportImg", oData.engine !== "D2");
        oViewModel.setProperty("/hasDiagram", true);

        try {
            const oHtml = this.byId("htmlRenderer") as HTML;
            Renderer.renderDiagram(oData.engine, oData.payload, oHtml, (sMsg: string) => this._showError(sMsg));
        } catch (oError: any) {
            this._showError(oError.message);
        }
    }

    /**
     * @public
     * @description Toggles Zen Mode purely via the global UI model.
     */
    public onToggleZenMode(): void {
        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        if (!oUiModel) return;

        const sCurrentSize = oUiModel.getProperty("/leftPaneSize");
        const sNewSize = sCurrentSize === "0px" ? "320px" : "0px";
        
        oUiModel.setProperty("/leftPaneSize", sNewSize);
    }

    private _showError(sMessage: string): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        oViewModel.setProperty("/hasError", true);
        oViewModel.setProperty("/hasDiagram", false);
        oViewModel.setProperty("/errorText", this._getText(sMessage) || sMessage);
    }

    private _resetState(): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        oViewModel.setProperty("/hasError", false);
        oViewModel.setProperty("/hasDiagram", false);
    }

    private _getText(sKey: string): string {
        const oBundle = (this.getOwnerComponent()?.getModel("i18n") as any)?.getResourceBundle();
        return oBundle ? oBundle.getText(sKey) || sKey : sKey;
    }

    // ========================================================================
    // EXPORT DELEGATIONS
    // ========================================================================

    public onDownloadPng(): void   { this._oExportHandler.downloadPng(); }
    public onDownloadImage(): void { this._oExportHandler.downloadSvg(); }
    public onDownloadSource(): void{ this._oExportHandler.downloadSource(); }
    public onCopySyntax(): void    { this._oExportHandler.copySyntax(); }
}