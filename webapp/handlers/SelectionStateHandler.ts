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
    public onCanvasStateChanged(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty("/nodesDragged", true);
            this.markDirtyState(false); // <--- Triggers the Warning state on the dropdown
            
            const sEngine = oUiModel.getProperty("/activeEngine");
            if (sEngine === "CYTOSCAPE") {
                oUiModel.setProperty("/formatCytoscape/layout_algorithm", "preset");
                const oCanvasState = Renderer.getCanvasState(sEngine);
                oUiModel.setProperty("/formatCytoscape/presetPositions", oCanvasState);
            }
        }
    }

    /**
     * @public
     * @description Triggered when the user pans or zooms the canvas.
     * @returns {void}
     */
    public onViewportChanged(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) {
            this.markDirtyState(false); // <--- Triggers the Warning state on the dropdown
            
            const sEngine = oUiModel.getProperty("/activeEngine");
            if (sEngine === "CYTOSCAPE") {
                const oCanvasState = Renderer.getCanvasState(sEngine);
                if (oCanvasState && oCanvasState.__camera) {
                    oUiModel.setProperty("/formatCytoscape/camera", oCanvasState.__camera);
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

        if (bResetLayout && oUiModel && oUiModel.getProperty("/formatCytoscape/layout_algorithm") === "preset") {
            oUiModel.setProperty("/formatCytoscape/layout_algorithm", "dagre");
            oUiModel.setProperty("/formatCytoscape/presetPositions", null);
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