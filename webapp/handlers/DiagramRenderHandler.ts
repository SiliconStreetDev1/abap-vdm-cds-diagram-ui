/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates Diagram rendering lifecycle and View Model updates.
 * @description Relieves the main controller of massive payload parsing and state management tasks.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import HTML from "sap/ui/core/HTML";
import Renderer from "../renderer/Renderer";
import { EngineType, IRenderRequestPayload } from "../types";

export default class DiagramRenderHandler {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;

    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._fnGetText = fnGetText;
    }

    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    public handleLiveFormatUpdate(oData: any): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty("/hasDiagram")) {
            try {
                Renderer.updateLiveFormat(this._getInstanceId(), oData.engine, oData.format);
            } catch (oError: any) {
                this.showError(oError.message);
            }
        }
    }

    public handleRenderRequest(oData: IRenderRequestPayload, oHtmlControl: HTML): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const oDataModel = this._oView.getModel("diagramData") as JSONModel;

        if (!oViewModel || !oDataModel) return;

        const bSupportsMinimap = Renderer.supportsMinimap(oData.engine);
        if (!bSupportsMinimap) {
            oViewModel.setProperty("/showMinimap", false);
            Renderer.toggleMinimap(this._getInstanceId(), oData.engine, false);
        }
        oViewModel.setProperty("/canShowMinimap", bSupportsMinimap);
        oViewModel.setProperty("/canSearch", Renderer.supportsSearch(oData.engine));

        this.resetState();

        // 1. Persist the payload for export operations
        oDataModel.setData({
            payload: oData.payload,
            extension: oData.extension,
            cdsName: oData.cdsName,
            engine: oData.engine,
            rootCdsName: oData.rootCdsName,
            breadcrumbLinks: (oData.breadcrumbs || []).slice(0, -1).map((name: string) => ({ name })),
            currentBreadcrumb: (oData.breadcrumbs || [])[(oData.breadcrumbs || []).length - 1] || "",
            engineConfig: oData.engineConfig
        });

        // 2. Extract specific export capabilities from the active Engine architecture
        oViewModel.setProperty("/canExportImg", Renderer.supportsImageExport(oData.engine));
        oViewModel.setProperty("/canExportSource", Renderer.supportsSourceExport(oData.engine));

        // 3. Prepare the general canvas UI state 
        oViewModel.setProperty("/hasDiagram", true);
        
        const bIsDrillDown = !!(oData.rootCdsName && oData.cdsName !== oData.rootCdsName);
        oViewModel.setProperty("/isDrillDown", bIsDrillDown);
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty("/isDrillDown", bIsDrillDown);
            
            if (Renderer.supportsStateCapture(oData.engine)) {
                const oModelData = oUiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${oData.engine}`);
                if (sFormatKey) {
                    if (oData.engineConfig?.presetPositions && (!bIsDrillDown || oData.engineConfig.isRestore)) {
                        oUiModel.setProperty(`/${sFormatKey}/layout_algorithm`, "preset");
                    } else if (bIsDrillDown && !oData.engineConfig?.isRestore && oUiModel.getProperty(`/${sFormatKey}/layout_algorithm`) === "preset") {
                        oUiModel.setProperty(`/${sFormatKey}/layout_algorithm`, "dagre");
                    }
                }
            }
        }
        
        oViewModel.setProperty("/isSelectMode", false); // Re-enforce default tool on new renders

        if (oData.engineConfig) {
            oData.engineConfig.isDrillDown = bIsDrillDown;
        }

        // 4. Trigger the WASM/JS rendering engine
        try {
            Renderer.renderDiagram(this._getInstanceId(), oData.engine, oData.payload, oHtmlControl, (sMsg: string) => this.showError(sMsg), oData.engineConfig)
                .catch((oError: any) => this.showError(oError.message || "Asynchronous rendering failure."));
        } catch (oError: any) {
            this.showError(oError.message);
        }
    }

    public showError(sMessage: string): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/hasError", true);
            oViewModel.setProperty("/errorText", this._fnGetText(sMessage) || sMessage);
        }
    }

    public resetState(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/hasError", false);
            oViewModel.setProperty("/hasDiagram", false);
            oViewModel.setProperty("/isFocusMode", false);
            oViewModel.setProperty("/focusNodeName", "");
        }
    }
}