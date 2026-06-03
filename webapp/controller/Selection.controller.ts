/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Selection Controller for capturing user input.
 * @version 2.1
 * @description Manages configuration state, triggers the OData backend service, 
 * and broadcasts the resulting payload via the EventBus. 
 */

import Controller from "sap/ui/core/mvc/Controller";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import Select from "sap/m/Select";
import Input from "sap/m/Input";
import MultiInput from "sap/m/MultiInput";
import MessageToast from "sap/m/MessageToast";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";

import VariantHandler from "../handlers/VariantHandler";
import VariantStateMapper from "../helpers/VariantStateMapper";
import SessionStateCache from "../helpers/SessionStateCache";
import DiagramGenerationHandler from "../handlers/DiagramGenerationHandler";
import SelectionStateHandler from "../handlers/SelectionStateHandler";
import SelectionUIHandler from "../handlers/SelectionUIHandler";
import InputValidationService from "../services/InputValidationService";
import { EventChannels, EventIds, DomEvents } from "../constants/EventConstants";
import ContextHelpManager from "../helpers/ContextHelpManager";

export default class Selection extends Controller {

    private _oVariantHandler!: VariantHandler;
    private _oGenerationHandler!: DiagramGenerationHandler;
    private _oStateHandler!: SelectionStateHandler;
    private _oUIHandler!: SelectionUIHandler;

    private _fnNodeDrillDownRequestBind!: EventListener;
    private _fnSliderUpdateBind!: EventListener;
    private _fnCanvasStateChangedBind!: EventListener;
    private _fnViewportChangedBind!: EventListener;
    private _fnEventBusDrillDownBind!: (c: string, e: string, d: Object) => void;

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private _getInstanceId(): string {
        return this.getOwnerComponent()?.getId() || this.getView()?.getId() || "";
    }

    /**
     * @public
     * @description Lifecycle hook. Bootstraps local handlers, validators, and default UI state.
     * @returns {void}
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        this._oVariantHandler = new VariantHandler(oView, this._getText.bind(this));
        this._oStateHandler = new SelectionStateHandler(oView, this._getText.bind(this));
        
        const oEventBus = this.getOwnerComponent()?.getEventBus();
        this._oGenerationHandler = new DiagramGenerationHandler(oView, oEventBus, this._getText.bind(this));
        this._oUIHandler = new SelectionUIHandler(oView, oEventBus, this._oStateHandler, this._getText.bind(this));

        const oIncInput = this.byId("inpInclude") as MultiInput;
        const oExcInput = this.byId("inpExclude") as MultiInput;
        const fnWarn = (sKey: string) => MessageToast.show(this._getText(sKey));
        
        const fnTokenValidator = InputValidationService.buildTokenValidator(oIncInput, oExcInput, fnWarn);
        oIncInput.addValidator(fnTokenValidator);
        oExcInput.addValidator(fnTokenValidator);

        this._oVariantHandler.loadHistoryAndVariants();

        const sInstanceId = this.getOwnerComponent()?.getId() || oView.getId();
        this._fnNodeDrillDownRequestBind = ((e: globalThis.Event) => {
            const oCustomEvent = e as unknown as CustomEvent<{ viewId: string, viewName: string }>;
            if (oCustomEvent.detail?.viewId && oCustomEvent.detail.viewId !== sInstanceId) return;
            this._processDrillDown(oCustomEvent.detail?.viewName as string);
        }) as EventListener;
        document.addEventListener(DomEvents.NODE_DRILL_DOWN, this._fnNodeDrillDownRequestBind);

        this._fnEventBusDrillDownBind = (c: string, e: string, d: Object) => this._processDrillDown((d as { viewName?: string })?.viewName);
        if (oEventBus) {
            oEventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.NODE_DRILL_DOWN, this._fnEventBusDrillDownBind, this);
        }

        this._fnSliderUpdateBind = this._oUIHandler.onSliderUpdate.bind(this._oUIHandler) as EventListener;
        document.addEventListener(DomEvents.FORMAT_SLIDER_UPDATE, this._fnSliderUpdateBind);

        this._fnCanvasStateChangedBind = this._oStateHandler.onCanvasStateChanged.bind(this._oStateHandler) as EventListener;
        this._fnViewportChangedBind = this._oStateHandler.onViewportChanged.bind(this._oStateHandler) as EventListener;
        
        document.addEventListener(DomEvents.NODE_DRAGGED, this._fnCanvasStateChangedBind);
        document.addEventListener(DomEvents.NODE_PINNED, this._fnCanvasStateChangedBind);
        document.addEventListener(DomEvents.NODE_HIDDEN, this._fnCanvasStateChangedBind);
        document.addEventListener(DomEvents.NODE_UNHIDDEN, this._fnCanvasStateChangedBind);
        document.addEventListener(DomEvents.CANVAS_VIEWPORT_CHANGED, this._fnViewportChangedBind);
    }

    /**
     * @public
     * @description Cleans up global event listeners to prevent memory leaks when the controller is destroyed.
     */
    public onExit(): void {
        document.removeEventListener(DomEvents.NODE_DRILL_DOWN, this._fnNodeDrillDownRequestBind);
        
        const oEventBus = this.getOwnerComponent()?.getEventBus();
        if (oEventBus) {
            oEventBus.unsubscribe(EventChannels.DIAGRAM_ENGINE, EventIds.NODE_DRILL_DOWN, this._fnEventBusDrillDownBind, this);
        }
        document.removeEventListener(DomEvents.FORMAT_SLIDER_UPDATE, this._fnSliderUpdateBind);
        document.removeEventListener(DomEvents.NODE_DRAGGED, this._fnCanvasStateChangedBind);
        document.removeEventListener(DomEvents.NODE_PINNED, this._fnCanvasStateChangedBind);
        document.removeEventListener(DomEvents.NODE_HIDDEN, this._fnCanvasStateChangedBind);
        document.removeEventListener(DomEvents.NODE_UNHIDDEN, this._fnCanvasStateChangedBind);
        document.removeEventListener(DomEvents.CANVAS_VIEWPORT_CHANGED, this._fnViewportChangedBind);

        ContextHelpManager.destroy(this._getInstanceId());
    }

    // ========================================================================
    // DELEGATED EVENT HANDLERS
    // ========================================================================

    /**
     * @public
     * @description Triggers diagram generation.
     * @returns {void}
     */
    public onGenerate(): void { this._oGenerationHandler.generate(false); }

    /**
     * @public
     * @description Handles engine select change.
     * @param {Event} e - Control event.
     * @returns {void}
     */
    public onEngineChange(e: Event): void { this._oUIHandler.onEngineChange(e); }

    /**
     * @public
     * @description Handles live visual formatting updates.
     * @returns {void}
     */
    public onLiveFormatChange(): void { this._oUIHandler.onLiveFormatChange(); }

    /**
     * @public
     * @description Switches layout rendering parameters.
     * @param {Event} e - SegmentedButton event.
     * @returns {void}
     */
    public onRelModeChange(e: Event): void { this._oUIHandler.onRelModeChange(e); }

    /**
     * @public
     * @description Opens the Variant save dialog.
     * @returns {void}
     */
    public onSaveVariant(): void { this._oVariantHandler.openSaveDialog(); }

    /**
     * @public
     * @description Deletes the selected user variant.
     * @returns {void}
     */
    public async onDeleteVariant(): Promise<void> { 
        const oVariantSelect = this.byId("selVariant") as Select;
        const sKeyBeforeDelete = oVariantSelect ? oVariantSelect.getSelectedKey() : "";

        // Enterprise UX: We now await the Promise returned by the VariantHandler to eliminate polling hacks
        try {
            await this._oVariantHandler.deleteSelected();

            const oVariantsModel = this.getView()?.getModel("variants") as JSONModel;
            const aVariants = oVariantsModel ? oVariantsModel.getProperty("/items") || [] : [];
            
            if (sKeyBeforeDelete) {
                if (oVariantSelect) {
                    oVariantSelect.setSelectedKey("");
                    oVariantSelect.setValueState("None");
                }
                if (aVariants.length === 0) {
                    const oUiModel = this.getView()?.getModel("ui") as JSONModel;
                    if (oUiModel) {
                        oUiModel.setProperty("/variantDirty", false);
                    }
                }
            }
        } catch (e) {
            // Deletion aborted or failed
        }
    }

    /**
     * @public
     * @description Applies a variant configuration and refreshes the canvas.
     * @param {Event} e - Select event.
     * @returns {void}
     */
    public onVariantChange(e: Event): void { 
        const oVariantSelect = e.getSource() as Select;
        if (oVariantSelect) oVariantSelect.setValueState("None");

        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/variantDirty", false);

        const sSelectedName = oVariantSelect ? oVariantSelect.getSelectedKey() : "";
        this._oVariantHandler.applyVariant(sSelectedName, () => this._oGenerationHandler.generate(false, false, true)); 
    }

    /**
     * @public
     * @description Restores the original state of the loaded variant, eliminating dirty edits.
     * @returns {void}
     */
    public onRevertVariant(): void {
        const oVariantSelect = this.byId("selVariant") as Select;
        if (oVariantSelect && oVariantSelect.getSelectedKey()) {
            oVariantSelect.setValueState("None");
            const oUiModel = this.getView()?.getModel("ui") as JSONModel;
            if (oUiModel) oUiModel.setProperty("/variantDirty", false);

            const sSelectedName = oVariantSelect.getSelectedKey();
            this._oVariantHandler.applyVariant(sSelectedName, () => this._oGenerationHandler.generate(false, false, true));
        }
    }
    
    /**
     * @private
     * @description Reconstructs the full breadcrumb path to uniquely key the session cache.
     */
    private _getBreadcrumbPath(): string {
        const oDataModel = this.getView()?.getModel("diagramData") as JSONModel;
        if (!oDataModel) return "";
        const aLinks = oDataModel.getProperty("/breadcrumbLinks") || [];
        const sCurrent = oDataModel.getProperty("/currentBreadcrumb") || oDataModel.getProperty("/cdsName") || "";
        return aLinks.map((l: any) => l.name).concat(sCurrent).map((s: string) => s.toUpperCase()).join('|');
    }

    /**
     * @private
     * @description Orchestrates drill-down requests. If navigating back to the root CDS of the 
     * active variant, it intelligently re-applies the variant to restore custom layout coordinates.
     * @param {string} sViewName - The target entity name.
     * @returns {void}
     */
    private _processDrillDown(sViewName?: string): void {
        if (!sViewName) return;

        const oInputField = this.byId("cmbCdsName") as Input;
        const sCurrentCdsName = oInputField ? oInputField.getValue().trim().toUpperCase() : "";
        const sTargetCdsName = sViewName.toUpperCase();

        const sCurrentPath = this._getBreadcrumbPath();
        const oDataModel = this.getView()?.getModel("diagramData") as JSONModel;
        const aLinks = oDataModel ? oDataModel.getProperty("/breadcrumbLinks") || [] : [];
        const iIndex = aLinks.findIndex((l: any) => l.name.toUpperCase() === sTargetCdsName);
        let sTargetPath = sTargetCdsName;
        if (iIndex > -1) {
            sTargetPath = aLinks.slice(0, iIndex + 1).map((l: any) => l.name.toUpperCase()).join('|');
        } else {
            sTargetPath = (sCurrentPath ? sCurrentPath + '|' : '') + sTargetCdsName;
        }

        // 1. Snapshot the current view's layout and settings before leaving
        if (sCurrentCdsName && sCurrentCdsName !== sTargetCdsName) {
            const oCurrentState = VariantStateMapper.captureState(this.getView() as View, sCurrentCdsName, true);
            SessionStateCache.set(this._getInstanceId(), sCurrentPath, oCurrentState);
        }

        // 2. Check if the target view has a cached session state (i.e., we are navigating BACK to it)
        const oCachedState = SessionStateCache.get(this._getInstanceId(), sTargetPath);
        if (oCachedState) {
            // Restore exact coordinates, zoom, pins, and hidden nodes without manual saves
            VariantStateMapper.applyState(this.getView() as View, oCachedState);
            this._oGenerationHandler.handleDrillDown(sViewName, true);
            return;
        }

        // 3. Standard fresh drill-down (marks the state as dirty because we are deviating from known architectures)
        this._oStateHandler.markDirtyState(true);
        this._oGenerationHandler.handleDrillDown(sViewName, false);
    }

    /**
     * @public
     * @description Opens the F4 Value Help for CDS searches.
     * @param {Event} e - ValueHelp request event.
     * @returns {void}
     */
    public onCdsValueHelpRequest(e: Event): void { this._oUIHandler.onCdsValueHelpRequest(e); }

    /**
     * @public
     * @description Triggered on core input edits to break layouts.
     * @returns {void}
     */
    public onCdsNameChange(): void { this._oStateHandler.onCdsNameChange(); }

    /**
     * @public
     * @description Triggered on auxiliary filter edits to mark unsaved states.
     * @returns {void}
     */
    public onFormChange(): void { this._oStateHandler.onFormChange(); }

    /**
     * @public
     * @description Displays inline contextual popover info.
     * @param {Event} e - Icon press event.
     * @returns {void}
     */
    public onShowInfo(e: Event): void { this._oUIHandler.onShowInfo(e); }

    /**
     * @private
     * @description Safe utility to retrieve translation strings. Fallback to key if missing.
     * @param {string} sKey - i18n key.
     * @param {any[]} aArgs - Optional arguments for string formatting.
     * @returns {string} Translated text.
     */
    private _getText(sKey: string, aArgs?: any[]): string {
        const oModel = this.getOwnerComponent()?.getModel("i18n") as ResourceModel;
        const oBundle = oModel?.getResourceBundle() as ResourceBundle;
        return oBundle ? oBundle.getText(sKey, aArgs) || sKey : sKey;
    }

    // ========================================================================
    // VIDEO RECORDING
    // ========================================================================
}