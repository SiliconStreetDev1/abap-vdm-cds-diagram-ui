/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Variant Drift and UI dirty states.
 */
import View from "sap/ui/core/mvc/View";
import { EventManager } from "../../events/EventManager";
import JSONModel from "sap/ui/model/json/JSONModel";
import Select from "sap/m/Select";
import Renderer from "../../renderer/Renderer";
import { UiState, ModelNames } from "../../constants/StateConstants";

export default class SelectionStateHandler {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;
    private _fnCanvasStateChangedBind!: any;
    private _bIsAttached: boolean = false;
    private _subscriptions: any[] = [];

    /**
     * @constructor
     * @param {View} oView - Reference to the active UI5 view.
     * @param {Function} fnGetText - Delegate function for i18n translations.
     */
    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._fnGetText = fnGetText;
    }

    /**
     * @public
     * @description Attaches custom DOM event listeners.
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;
        this._fnCanvasStateChangedBind = this.onCanvasStateChanged.bind(this) as any;
        if (typeof document !== "undefined") {
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodePositionChanged", this._fnCanvasStateChangedBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:variantDirty", this._fnCanvasStateChangedBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodePinned", this._fnCanvasStateChangedBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodeHidden", this._fnCanvasStateChangedBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodeUnhidden", this._fnCanvasStateChangedBind));
        }
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches custom DOM event listeners to prevent memory leaks during component destruction.
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;
        if (typeof document !== "undefined") {
            /* removed */
            /* removed */
            /* removed */
            /* removed */
        }
        this._bIsAttached = false;
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
        const payload = oEvent as any;
        if (payload && payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        const oUiModel = this._oView.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty(UiState.NODES_DRAGGED, true);
            this.markDirtyState(false); // <--- Triggers the Warning state on the dropdown
            
            const sEngine = oUiModel.getProperty(UiState.ACTIVE_ENGINE);
            const bIsDrillDown = oUiModel.getProperty(UiState.IS_DRILL_DOWN);
            
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
     * @description Marks the UI state as dirty, displaying warning indicators to the user.
     * @param {boolean} bResetLayout - Whether the layout logic must be reset to defaults.
     * @returns {void}
     */
    public markDirtyState(bResetLayout: boolean): void {
        const oUiModel = this._oView.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel) oUiModel.setProperty(UiState.VARIANT_DIRTY, true);

        const oVariantSelect = this._oView.byId("selVariant") as Select;
        if (oVariantSelect && oVariantSelect.getSelectedKey()) {
            oVariantSelect.setValueState("Warning");
            oVariantSelect.setValueStateText(this._fnGetText("msgUnsavedChanges") || "Unsaved changes");
        }

        const sEngine = oUiModel?.getProperty(UiState.ACTIVE_ENGINE);
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
        const oUiModel = this._oView.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty(UiState.IS_CANVAS_STALE, true);
        }
    }
}