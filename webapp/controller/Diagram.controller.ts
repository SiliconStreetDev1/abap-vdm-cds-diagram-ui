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
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Link from "sap/m/Link";

import ExportHandler from "../handlers/ExportHandler";
import FullScreenHandler from "../handlers/FullScreenHandler";
import CanvasActionHandler from "../handlers/CanvasActionHandler";
import CanvasKeyboardHandler from "../handlers/CanvasKeyboardHandler";
import HiddenNodesHandler from "../handlers/HiddenNodesHandler";
import NoteDialogHandler from "../handlers/NoteDialogHandler";
import UndoHandler from "../handlers/UndoHandler";
import DiagramRenderHandler from "../handlers/DiagramRenderHandler";
import VideoRecordHandler from "../handlers/VideoRecordHandler";
import Renderer from "../renderer/Renderer";
import ContextHelpManager from "../helpers/ContextHelpManager";
import { EventChannels, EventIds, DomEvents } from "../constants/EventConstants";

export default class Diagram extends Controller {
    
    private _oExportHandler!: ExportHandler;
    private _oFullScreenHandler!: FullScreenHandler;
    private _oCanvasActionHandler!: CanvasActionHandler;
    private _oCanvasKeyboardHandler!: CanvasKeyboardHandler;
    private _oHiddenNodesHandler!: HiddenNodesHandler;
    private _oNoteDialogHandler!: NoteDialogHandler;
    private _oUndoHandler!: UndoHandler;
    private _oRenderHandler!: DiagramRenderHandler;
    private _videoRecordHandler!: VideoRecordHandler;
    
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
     * @description Bootstraps local models, EventBus subscriptions, and DOM event listeners.
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
        }), "view");
        
        // Data model storage required for ExportHandler operations
        oView.setModel(new JSONModel({ 
            payload: "", 
            extension: "", 
            cdsName: "", 
            engine: "",
            rootCdsName: "",
            breadcrumbLinks: [],
            currentBreadcrumb: ""
        }), "diagramData");

        // Initialize the export service
        this._oRenderHandler = new DiagramRenderHandler(oView, this.getOwnerComponent()?.getEventBus(), this._getText.bind(this));
        this._oExportHandler = new ExportHandler(oView, this._getText.bind(this), this._oRenderHandler.showError.bind(this._oRenderHandler));
        this._oFullScreenHandler = new FullScreenHandler(oView);
        this._oCanvasActionHandler = new CanvasActionHandler(oView, this.getOwnerComponent()?.getEventBus());
        this._oCanvasKeyboardHandler = new CanvasKeyboardHandler(oView, this.getOwnerComponent()?.getEventBus());
        this._oHiddenNodesHandler = new HiddenNodesHandler(oView);
        this._oNoteDialogHandler = new NoteDialogHandler(oView);
        this._oUndoHandler = new UndoHandler(oView, this.getOwnerComponent()?.getEventBus());
        this._videoRecordHandler = new VideoRecordHandler(oView, this.getOwnerComponent()?.getEventBus(), this._getText.bind(this));
        
        this._oRenderHandler.attachEvents();
        this._oFullScreenHandler.attachEvents();
        this._oCanvasActionHandler.attachEvents();
        this._oCanvasKeyboardHandler.attachEvents();
        this._oHiddenNodesHandler.attachEvents();
        this._oNoteDialogHandler.attachEvents();
        this._oUndoHandler.attachEvents();
        this._videoRecordHandler.attachEvents();
    }

    /**
     * @public
     * @description Cleans up global event listeners to prevent memory leaks when the controller is destroyed.
     */
    public onExit(): void {
        this._oRenderHandler.detachEvents();
        this._oFullScreenHandler.detachEvents();
        this._oCanvasActionHandler.detachEvents();
        this._oCanvasKeyboardHandler.detachEvents();
        this._oHiddenNodesHandler.detachEvents();
        this._oNoteDialogHandler.detachEvents();
        this._oUndoHandler.detachEvents();

        if (this._videoRecordHandler) {
            this._videoRecordHandler.detachEvents();
            this._videoRecordHandler.stopRecording();
        }

        ContextHelpManager.destroy(this._getInstanceId());

        // CLEANUP: Destroy static engine instances and WebGL contexts to prevent memory leaks in the Fiori Launchpad
        Renderer.destroyActiveEngine(this._getInstanceId());
    }

    // ========================================================================
    // CANVAS ACTION DELEGATIONS
    // ========================================================================
    
    public onUndo(): void {
        if (typeof document !== "undefined") {
            document.dispatchEvent(new CustomEvent(DomEvents.UNDO_REQUEST, { detail: { viewId: this._getInstanceId() } }));
        }
    }

    public onToggleFullScreen(): void { this._oFullScreenHandler.toggleFullScreen(this.getView() as Control); }
    public onToggleMinimap(oEvent: Event): void { this._oCanvasActionHandler.toggleMinimap(oEvent); }
    public onChangeInteractionMode(oEvent: Event): void { this._oCanvasActionHandler.changeInteractionMode(oEvent); }
    public onSpacingChange(): void { this._oCanvasActionHandler.changeSpacing(); }
    public onToggleTempFocusMode(oEvent: Event): void { this._oCanvasActionHandler.toggleTempFocusMode(oEvent); }
    public onClearFocus(): void { this._oCanvasActionHandler.clearSelection(); }
    public onSelectAll(): void { this._oCanvasActionHandler.selectAll(); }
    public onAddNote(): void { this._oNoteDialogHandler.promptAddNote(); }

    public onOpenHiddenNodes(): void { this._oHiddenNodesHandler.openDialog(); }
    public onCloseHiddenNodes(): void { this._oHiddenNodesHandler.closeDialog(); }
    public onRestoreSelectedNodes(): void { this._oHiddenNodesHandler.restoreSelected(); }
    public onShowHiddenNodes(): void { this._oHiddenNodesHandler.showAll(); }
    public onShowSpacing(oEvent: Event): void { this._oCanvasActionHandler.showSpacingPopover(oEvent); }

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
        const oLink = oEvent.getSource() as Link;
        const sViewName = oLink.getText();
        if (sViewName) {
            const oEventBus = this.getOwnerComponent()?.getEventBus();
            if (oEventBus) {
                oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.NODE_DRILL_DOWN, { viewName: sViewName });
            }
        }
    }

    /**
     * @public
     * @description Fires a drill-down request for the currently focused entity.
     */
    public onFocusDrillDown(): void {
        const sViewName = (this.getView()?.getModel("view") as JSONModel)?.getProperty("/focusNodeName");
        if (sViewName) {
            const oEventBus = this.getOwnerComponent()?.getEventBus();
            if (oEventBus) {
                oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.NODE_DRILL_DOWN, { viewName: sViewName });
            }
        }
    }

    /**
     * @public
     * @description Search handler for locating specific nodes in the active canvas.
     */
    public onSearchCanvas(oEvent: SearchField$SearchEvent): void { this._oCanvasActionHandler.searchCanvas(oEvent); }

    /**
     * @private
     * @description Safe utility to retrieve translation strings.
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
    // EXPORT DELEGATIONS
    // ========================================================================

    public onDownloadPng(): void   { this._oExportHandler.downloadPng(); }
    public onDownloadImage(): void { this._oExportHandler.downloadSvg(); }
    public onDownloadSource(): void{ this._oExportHandler.downloadSource(); }
    public onCopySyntax(): void    { this._oExportHandler.copySyntax(); }

    // ========================================================================
    // VIDEO RECORDING DELEGATIONS
    // ========================================================================

    public onStartRecording(): void  { this._videoRecordHandler.startRecording(); }
    public onStopRecording(): void   { this._videoRecordHandler.stopRecording(); }
    public onPauseRecording(): void  { this._videoRecordHandler.pauseRecording(); }
    public onResumeRecording(): void { this._videoRecordHandler.resumeRecording(); }

}
