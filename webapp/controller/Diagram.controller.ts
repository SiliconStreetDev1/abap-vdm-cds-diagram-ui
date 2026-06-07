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
import Fragment from "sap/ui/core/Fragment";
import Link from "sap/m/Link";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import UIComponent from "sap/ui/core/UIComponent";

import ToolboxManager from "../handlers/ToolboxManager";
import ExportPipelineModule from "../services/ExportPipelineModule";
import Renderer from "../renderer/Renderer";
import ContextHelpManager from "../helpers/ContextHelpManager";
import SettingsDialogController from "./SettingsDialog.controller";
import DiagramModelInit from "../helpers/DiagramModelInit";
import DiagramRoutingManager from "../helpers/DiagramRoutingManager";
import { ViewState, UiState, ModelNames, DiagramData } from "../constants/StateConstants";

import SoundscapeManager from "../services/SoundscapeManager";
import { EventManager } from "../events/EventManager";
import { DiagramStateStore } from "../store/DiagramStateStore";

export default class Diagram extends Controller {
    
    private exportPipelineModule!: ExportPipelineModule;
    private _pSettingsDialog?: Promise<Control>;
    
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
        const activeView = this.getView();
        if (!activeView) {
            return;
        }

        DiagramModelInit.bootstrapModels(activeView);

        // Initialize the Toolbox Manager for all canvas interaction handlers
        ToolboxManager.bootstrap(this._getInstanceId(), activeView, this._getText.bind(this));

        // Initialize the new unified Export Pipeline
        const renderHandler = ToolboxManager.getRenderHandler(this._getInstanceId());
        this.exportPipelineModule = new ExportPipelineModule(activeView, this._getText.bind(this), renderHandler ? renderHandler.showError.bind(renderHandler) : () => {});
    }

    /**
     * @public
     * @description Cleans up global event listeners and explicitly destroys asynchronous UI5 
     * components to guarantee deterministic garbage collection and prevent memory leaks.
     */
    public onExit(): void {
        ToolboxManager.destroy(this._getInstanceId());
        ContextHelpManager.destroy(this._getInstanceId());

        // CLEANUP: Destroy static engine instances and WebGL contexts
        Renderer.destroyActiveEngine(this._getInstanceId());
        
        // CLEANUP: Free the Redux-like state store for this view instance
        DiagramStateStore.getInstance().clearDiagramState(this._getInstanceId());

        // CLEANUP: Explicitly destroy the dynamically loaded Settings Fragment
        if (this._pSettingsDialog) {
            this._pSettingsDialog.then((settingsDialogControl: any) => {
                if (settingsDialogControl && !settingsDialogControl.bIsDestroyed) {
                    settingsDialogControl.destroy();
                }
            });
            this._pSettingsDialog = undefined;
        }
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
        const activeView = this.getView();
        const ownerComponent = this.getOwnerComponent() as UIComponent;
        
        if (activeView) {
            DiagramRoutingManager.cloneToWorkspace(activeView, ownerComponent, this._getInstanceId());
        }
    }
    // CANVAS ACTION DELEGATIONS
    // ========================================================================
    
    /**
     * @public
     * @description Executes onUndo functionality.
     */
    public onUndo(): void {
        if (typeof document !== "undefined") {
            EventManager.getInstance().publish("canvas:undoRequest", { viewId: this._getInstanceId() });
        }
    }

    /**
     * @public
     * @description Executes onToggleFullScreen functionality.
     */
    public onToggleFullScreen(): void { ToolboxManager.getFullScreenHandler(this._getInstanceId())?.toggleFullScreen(this.getView() as Control); }
    /**
     * @public
     * @description Executes onToggleMinimap functionality.
     */
    public onToggleMinimap(oEvent: Event): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.toggleMinimap(oEvent); }
    /**
     * @public
     * @description Executes onChangeInteractionMode functionality.
     */
    public onChangeInteractionMode(oEvent: Event): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.changeInteractionMode(oEvent); }
    /**
     * @public
     * @description Executes onSpacingChange functionality.
     */
    public onSpacingChange(): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.changeSpacing(); }
    /**
     * @public
     * @description Executes onToggleTempFocusMode functionality.
     */
    public onToggleTempFocusMode(oEvent: Event): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.toggleTempFocusMode(oEvent); }
    /**
     * @public
     * @description Executes onClearFocus functionality.
     */
    public onClearFocus(): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.clearSelection(); }
    /**
     * @public
     * @description Executes onSelectAll functionality.
     */
    public onSelectAll(): void { ToolboxManager.getCanvasActionHandler(this._getInstanceId())?.selectAll(); }
    /**
     * @public
     * @description Executes onAddNote functionality.
     */
    public onAddNote(): void { EventManager.getInstance().publish("canvas:promptAddNoteRequest", { viewId: this._getInstanceId() }); }

    /**
     * @public
     * @description Executes onOpenHiddenNodes functionality.
     */
    public onOpenHiddenNodes(): void { EventManager.getInstance().publish("ui:openDialog", { viewId: this._getInstanceId(), dialogType: "HiddenNodes" }); }
    /**
     * @public
     * @description Executes onCloseHiddenNodes functionality.
     */
    public onCloseHiddenNodes(): void { EventManager.getInstance().publish("ui:closeDialog", { viewId: this._getInstanceId(), dialogType: "HiddenNodes" }); }
    /**
     * @public
     * @description Executes onRestoreSelectedNodes functionality.
     */
    public onRestoreSelectedNodes(): void { EventManager.getInstance().publish("ui:restoreSelectedNodes", { viewId: this._getInstanceId() }); }
    /**
     * @public
     * @description Executes onShowHiddenNodes functionality.
     */
    public onShowHiddenNodes(): void { EventManager.getInstance().publish("ui:showAllHiddenNodes", { viewId: this._getInstanceId() }); }
    /**
     * @public
     * @description Executes onShowSpacing functionality.
     */
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
        const uiModel = this.getView()?.getModel(ModelNames.UI) as JSONModel;
        if (uiModel && uiModel.getProperty(UiState.IS_VIEWER_MODE)) return;

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
        const uiModel = this.getView()?.getModel(ModelNames.UI) as JSONModel;
        if (uiModel && uiModel.getProperty(UiState.IS_VIEWER_MODE)) return;

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

    /**
     * @public
     * @description Executes onDownloadPng functionality.
     */
    public onDownloadPng(): void   { this.exportPipelineModule.downloadPng(); }
    /**
     * @public
     * @description Executes onDownloadImage functionality.
     */
    public onDownloadImage(): void { this.exportPipelineModule.downloadSvg(); }
    /**
     * @public
     * @description Executes onDownloadSource functionality.
     */
    public onDownloadSource(): void{ this.exportPipelineModule.downloadSource(); }
    /**
     * @public
     * @description Executes onCopySyntax functionality.
     */
    public onCopySyntax(): void    { this.exportPipelineModule.copySyntax(); }

    // ========================================================================
    // VIDEO RECORDING DELEGATIONS
    // ========================================================================

    /**
     * @public
     * @description Executes onStartRecording functionality.
     */
    public onStartRecording(): void  { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.startRecording(); }
    /**
     * @public
     * @description Executes onStopRecording functionality.
     */
    public onStopRecording(): void   { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.stopRecording(); }
    /**
     * @public
     * @description Executes onPauseRecording functionality.
     */
    public onPauseRecording(): void  { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.pauseRecording(); }
    /**
     * @public
     * @description Executes onResumeRecording functionality.
     */
    public onResumeRecording(): void { ToolboxManager.getVideoRecordHandler(this._getInstanceId())?.resumeRecording(); }

    // ========================================================================
    // APP CONFIGURATION / SETTINGS
    // ========================================================================

    /**
     * @public
     * @description Asynchronously loads the isolated Settings Dialog Fragment
     * and binds it to the dedicated SettingsDialog Controller.
     * @returns {Promise<void>}
     */
    public async onOpenSettings(): Promise<void> {
        const activeView = this.getView();
        if (!activeView) {
            return;
        }

        if (!this._pSettingsDialog) {
            this._pSettingsDialog = Fragment.load({
                id: activeView.getId(),
                name: "nz.co.siliconstreet.vdmdiagrammer.view.fragments.SettingsDialog",
                controller: new SettingsDialogController(activeView)
            }).then((fragmentControl) => {
                activeView.addDependent(fragmentControl as Control);
                return fragmentControl as Control;
            });
        }

        const settingsDialogControl = await this._pSettingsDialog;
        (settingsDialogControl as any).open();
    }
}
