/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Variant Drift and UI dirty states.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Select from "sap/m/Select";
import Renderer from "../renderer/Renderer";

export default class SelectionStateHandler {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;

    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._fnGetText = fnGetText;
    }

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    /**
     * @public
     * @description Triggered when the CDS name changes, requiring a full layout reset.
     * @returns {void}
     */
    public onCdsNameChange(): void { 
        this.markDirtyState(true); 
        this.markStaleState();
    }

    /**
     * @public
     * @description Triggered when standard form filters/parameters change.
     * @returns {void}
     */
    public onFormChange(): void { 
        this.markDirtyState(false); 
        this.markStaleState();
    }

    /**
     * @public
     * @description Triggered when nodes are interactively manipulated on the canvas.
     * @returns {void}
     */
    public onCanvasStateChanged(oEvent?: globalThis.Event): void {
        if (oEvent && (oEvent as unknown as CustomEvent).detail?.viewId && (oEvent as unknown as CustomEvent).detail?.viewId !== this._getInstanceId()) return;
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty("/nodesDragged", true);
            this.markDirtyState(false); // <--- Triggers the Warning state on the dropdown
            
            const sEngine = oUiModel.getProperty("/activeEngine");
            const bIsDrillDown = oUiModel.getProperty("/isDrillDown");
            
            if (sEngine && Renderer.supportsStateCapture(sEngine) && !bIsDrillDown) {
                const oModelData = oUiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
                if (sFormatKey) {
                    oUiModel.setProperty(`/${sFormatKey}/layout_algorithm`, "preset");
                    const oCanvasState = Renderer.getCanvasState(this._getInstanceId(), sEngine);
                    oUiModel.setProperty(`/${sFormatKey}/presetPositions`, oCanvasState);
                }
            }
        }
    }

    /**
     * @public
     * @description Triggered when the user pans or zooms the canvas.
     * @returns {void}
     */
    public onViewportChanged(oEvent?: globalThis.Event): void {
        if (oEvent && (oEvent as unknown as CustomEvent).detail?.viewId && (oEvent as unknown as CustomEvent).detail?.viewId !== this._getInstanceId()) return;
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) {
            this.markDirtyState(false); // <--- Triggers the Warning state on the dropdown
            
            const sEngine = oUiModel.getProperty("/activeEngine");
            if (sEngine && Renderer.supportsStateCapture(sEngine)) {
                const oCanvasState = Renderer.getCanvasState(this._getInstanceId(), sEngine);
                if (oCanvasState && oCanvasState.__camera) {
                    const oModelData = oUiModel.getData();
                    const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
                    if (sFormatKey) {
                        oUiModel.setProperty(`/${sFormatKey}/camera`, oCanvasState.__camera);
                    }
                }
            }
        }
    }

    /**
     * @public
     * @description Marks the UI state as dirty, displaying warning indicators to the user.
     * @param {boolean} bResetLayout - Whether the layout logic must be reset to defaults.
     * @returns {void}
     */
    public markDirtyState(bResetLayout: boolean): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/variantDirty", true);

        const oVariantSelect = this._oView.byId("selVariant") as Select;
        if (oVariantSelect && oVariantSelect.getSelectedKey()) {
            oVariantSelect.setValueState("Warning");
            oVariantSelect.setValueStateText(this._fnGetText("msgUnsavedChanges") || "Unsaved changes");
        }

        const sEngine = oUiModel?.getProperty("/activeEngine");
        if (bResetLayout && oUiModel && sEngine && Renderer.supportsStateCapture(sEngine)) {
            const oModelData = oUiModel.getData();
            const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
            if (sFormatKey && oUiModel.getProperty(`/${sFormatKey}/layout_algorithm`) === "preset") {
                oUiModel.setProperty(`/${sFormatKey}/layout_algorithm`, "dagre");
                oUiModel.setProperty(`/${sFormatKey}/presetPositions`, null);
            }
        }
    }

    /**
     * @public
     * @description Marks the visual canvas as stale, prompting the user to re-generate.
     * @returns {void}
     */
    public markStaleState(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty("/isCanvasStale", true);
            oUiModel.setProperty("/formatCytoscape/camera", null);
        }
    }
}