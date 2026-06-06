/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Standalone Canvas Controller for V2 Architecture.
 * @version 2.5
 * @description Manages the rendering lifecycle of CDS diagrams, true OS-level 
 * fullscreen capabilities, and delegates export actions to the ExportHandler.
 */

import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import View from "sap/ui/core/mvc/View";
import Event from "sap/ui/base/Event";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Control from "sap/ui/core/Control";
import MessageToast from "sap/m/MessageToast";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Link from "sap/m/Link";
import UIComponent from "sap/ui/core/UIComponent";

import ToolboxManager from "../handlers/ToolboxManager";
import ExportPipelineModule from "../services/ExportPipelineModule";
import Renderer from "../renderer/Renderer";
import ContextHelpManager from "../helpers/ContextHelpManager";
import { ViewState, UiState, ModelNames, DiagramData } from "../constants/StateConstants";

import SoundscapeManager from "../services/SoundscapeManager";
import { EventManager } from "../events/EventManager";
import { DiagramStateStore } from "../store/DiagramStateStore";

export default class Diagram extends Controller {
    
    private _exportPipelineModule!: ExportPipelineModule;
    
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
     * @description Bootstraps local models, EventManager subscriptions, and DOM event listeners.
     * @returns {void}
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        // Local UI state model (controls Toolbar visibility and icons)
        oView.setModel(new JSONModel({ 
            hasDiagram: false, 
            hasError: false, 
            errorText: "", 
            canExportImg: false,
            canExportSource: false,
            showMinimap: false,
            canShowMinimap: false,
            canSearch: false,
            fullScreenIcon: "sap-icon://full-screen", // Default icon state
            isFullScreen: false,
            hasHiddenNodes: false,
            isSelectMode: true,
            isFocusMode: false,
            focusNodeName: "",
            hasNodeSelected: false,
            tempFocusMode: false
        }), ModelNames.VIEW);
        
        // Data model storage required for ExportHandler operations
        oView.setModel(new JSONModel({ 
            payload: "", 
            extension: "", 
            cdsName: "", 
            engine: "",
            rootCdsName: "",
            breadcrumbLinks: [],
            currentBreadcrumb: ""
        }), ModelNames.DIAGRAM_DATA);

        // Initialize the Toolbox Manager for all canvas interaction handlers
        ToolboxManager.bootstrap(this._getInstanceId(), oView, this._getText.bind(this));

        // Initialize the new unified Export Pipeline
        const oRenderHandler = ToolboxManager.getRenderHandler(this._getInstanceId());
        this._exportPipelineModule = new ExportPipelineModule(oView, this._getText.bind(this), oRenderHandler ? oRenderHandler.showError.bind(oRenderHandler) : () => {});
    }

    /**
     * @public
     * @description Cleans up global event listeners to prevent memory leaks when the controller is destroyed.
     */
    public onExit(): void {
        ToolboxManager.destroy(this._getInstanceId());

        ContextHelpManager.destroy(this._getInstanceId());

        // CLEANUP: Destroy static engine instances and WebGL contexts to prevent memory leaks in the Fiori Launchpad
        Renderer.destroyActiveEngine(this._getInstanceId());
        
        // CLEANUP: Free the Redux-like state store for this view instance
        DiagramStateStore.getInstance().clearDiagramState(this._getInstanceId());
    }

    // ========================================================================
    
    /**
     * @public
     * @description Executed from the Viewer presentation canvas. Detaches the unlisted 
     * Variant UUID from memory, restores the builder layout panels, and allows the 
     * consumer to save the current visual snapshot as their own private variant.
     * @returns {void}
     */
    public onCloneToWorkspace(): void {
        const oUiModel = this.getView()?.getModel(ModelNames.UI) as JSONModel;
        if (!oUiModel) return;

        // 1. Detach the original creator's Variant UUID from memory
        oUiModel.setProperty(UiState.SELECTED_VARIANT, "");
        oUiModel.setProperty(UiState.VARIANT_DIRTY, true);

        // 2. Restore Builder interaction constraints
        oUiModel.setProperty(UiState.IS_VIEWER_MODE, false);
        oUiModel.setProperty(UiState.FCL_LAYOUT, "TwoColumnsMidExpanded");

        // 3. Purge the deep link from the URL without triggering an OS-level page reload
        const oRouter = (this.getOwnerComponent() as UIComponent)?.getRouter();
        if (oRouter) {
            oRouter.navTo("RouteMain", {}, undefined, true);
        }
        
        // Re-hydrate the Selection pane with the cloned variant's state
        const variantState = oUiModel.getProperty("/loadedVariantState");
        if (variantState) {
            
            // ENTERPRISE FIX: Capture LIVE viewer changes (pins, hidden nodes, pan/zoom) before cloning
            const oDataModel = this.getView()?.getModel(ModelNames.DIAGRAM_DATA) as JSONModel;
            if (oDataModel) {
                const sEngine = oDataModel.getProperty(DiagramData.ENGINE);
                if (sEngine && Renderer.supportsStateCapture(sEngine)) {
                    const liveState = Renderer.getCanvasState(this._getInstanceId(), sEngine);
                    if (liveState) {
                        variantState.canvasState = liveState;
                    }
                }
            }

            oUiModel.setProperty("/clonedVariantName", variantState.name ? `Copy of ${variantState.name}` : "");
            EventManager.getInstance().publish("diagram:applyVariantState", variantState);
        }

        MessageToast.show(this._getText("msgClonedToWorkspace"));
    }
    // CANVAS ACTION DELEGATIONS
    // ========================================================================
    
    public onUndo(): void {
        if (typeof document !== "undefined") {
            EventManager.getInstance().publish("canvas:undoRequest", { viewId: this._getInstanceId() });
        }
    }

    public onToggleFullScreen(): void { ToolboxManager.getFullScreenHandler(this._getInstanceId())?.toggleFullScreen(this.getView() as Control); }
    public onToggleMinimap(oEvent: Event): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.toggleMinimap(oEvent); }
    public onChangeInteractionMode(oEvent: Event): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.changeInteractionMode(oEvent); }
    public onSpacingChange(): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.changeSpacing(); }
    public onToggleTempFocusMode(oEvent: Event): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.toggleTempFocusMode(oEvent); }
    public onClearFocus(): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.clearSelection(); }
    public onSelectAll(): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.selectAll(); }
    public onAddNote(): void { EventManager.getInstance().publish("canvas:promptAddNoteRequest", { viewId: this._getInstanceId() }); }

    public onOpenHiddenNodes(): void { EventManager.getInstance().publish("ui:openDialog", { viewId: this._getInstanceId(), dialogType: "HiddenNodes" }); }
    public onCloseHiddenNodes(): void { EventManager.getInstance().publish("ui:closeDialog", { viewId: this._getInstanceId(), dialogType: "HiddenNodes" }); }
    public onRestoreSelectedNodes(): void { EventManager.getInstance().publish("ui:restoreSelectedNodes", { viewId: this._getInstanceId() }); }
    public onShowHiddenNodes(): void { EventManager.getInstance().publish("ui:showAllHiddenNodes", { viewId: this._getInstanceId() }); }
    public onShowSpacing(oEvent: Event): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.showSpacingPopover(oEvent); }

    /**
     * @public
     * @description Displays inline contextual popover info for Canvas tools.
     * @param {Event} oEvent - Icon press event.
     * @returns {void}
     */
    public onShowInfo(oEvent: Event): void { 
        ContextHelpManager.openPopover(oEvent, this.getView() as View, this._getText.bind(this)); 
    }

    /**
     * @public
     * @description Fires a drill-down request for a specific breadcrumb, gracefully returning the user.
     */
    public onBreadcrumbPress(oEvent: Event): void {
        // ENTERPRISE SECURE: Block breadcrumb drill-downs in read-only Viewer Mode
        const oUiModel = this.getView()?.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel && oUiModel.getProperty(UiState.IS_VIEWER_MODE)) return;

        const oLink = oEvent.getSource() as Link;
        const sViewName = oLink.getText();
        if (sViewName) {
            EventManager.getInstance().publish("diagram:nodeDrillDown", { viewName: sViewName });
        }
    }

    /**
     * @public
     * @description Fires a drill-down request for the currently focused entity.
     */
    public onFocusDrillDown(): void {
        // ENTERPRISE SECURE: Block popup drill-downs in read-only Viewer Mode
        const oUiModel = this.getView()?.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel && oUiModel.getProperty(UiState.IS_VIEWER_MODE)) return;

        const sViewName = (this.getView()?.getModel(ModelNames.VIEW) as JSONModel)?.getProperty(ViewState.FOCUS_NODE_NAME);
        if (sViewName) {
            EventManager.getInstance().publish("diagram:nodeDrillDown", { viewName: sViewName });
        }
    }

    /**
     * @public
     * @description Fires a deep-link request to open the focused entity in Eclipse (ABAP Development Tools).
     */
    public onOpenInADT(): void {
        const sViewName = (this.getView()?.getModel(ModelNames.VIEW) as JSONModel)?.getProperty(ViewState.FOCUS_NODE_NAME);
        if (sViewName) {
            const sSystemId = window.location.hostname.split('.')[0] || "ABAP"; 
            window.open(`adt://${sSystemId}/sap/bc/adt/ddic/ddl/sources/${sViewName.toLowerCase()}`);
        }
    }

    /**
     * @public
     * @description Search handler for locating specific nodes in the active canvas.
     */
    public onSearchCanvas(oEvent: SearchField$SearchEvent): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.searchCanvas(oEvent); }

    /**
     * @private
     * @description Safe utility to retrieve translation strings.
     * @param {string} sKey - i18n key.
     * @param {any[]} aArgs - Optional arguments for string formatting.
     * @returns {string} Translated text.
     */
    private _getText(sKey: string, aArgs?: any[]): string {
        const oModel = this.getOwnerComponent()?.getModel(ModelNames.I18N) as ResourceModel;
        const oBundle = oModel?.getResourceBundle() as ResourceBundle;
        return oBundle ? oBundle.getText(sKey, aArgs) || sKey : sKey;
    }

    // ========================================================================
    // EXPORT DELEGATIONS
    // ========================================================================

    public onDownloadPng(): void   { this._exportPipelineModule.downloadPng(); }
    public onDownloadImage(): void { this._exportPipelineModule.downloadSvg(); }
    public onDownloadSource(): void{ this._exportPipelineModule.downloadSource(); }
    public onCopySyntax(): void    { this._exportPipelineModule.copySyntax(); }

    // ========================================================================
    // VIDEO RECORDING DELEGATIONS
    // ========================================================================

    public onStartRecording(): void  { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.startRecording(); }
    public onStopRecording(): void   { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.stopRecording(); }
    public onPauseRecording(): void  { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.pauseRecording(); }
    public onResumeRecording(): void { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.resumeRecording(); }

    /**
     * @public
     * @description Toggles UI Soundscapes and persists user preference to LocalStorage.
     * @param {Event} oEvent - The toggle button event.
     */
    public onToggleAudio(oEvent: Event): void {
        const oUiModel = this.getView()?.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel) {
            const bNewState = !oUiModel.getProperty(UiState.ENABLE_AUDIO);
            oUiModel.setProperty(UiState.ENABLE_AUDIO, bNewState);
            localStorage.setItem("vdmAudioEnabled", bNewState ? "true" : "false");
        }
    }
}
