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
import HTML from "sap/ui/core/HTML";
import Event from "sap/ui/base/Event";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Control from "sap/ui/core/Control";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Link from "sap/m/Link";
import ResponsivePopover from "sap/m/ResponsivePopover";
import Dialog from "sap/m/Dialog";
import Slider from "sap/m/Slider";
import ToggleButton from "sap/m/ToggleButton";
import List from "sap/m/List";

import ExportHandler from "../handlers/ExportHandler";
import FullScreenHandler from "../handlers/FullScreenHandler";
import CanvasActionHandler from "../handlers/CanvasActionHandler";
import NoteDialogHandler from "../handlers/NoteDialogHandler";
import UndoHandler from "../handlers/UndoHandler";
import Renderer from "../renderer/Renderer";
import ContextHelpManager from "../helpers/ContextHelpManager";
import { EngineType, IRenderRequestPayload } from "../types";
import { EventChannels, EventIds } from "../constants/EventConstants";

export default class Diagram extends Controller {
    
    private _oExportHandler!: ExportHandler;
    private _oFullScreenHandler!: FullScreenHandler;
    private _oCanvasActionHandler!: CanvasActionHandler;
    private _oNoteDialogHandler!: NoteDialogHandler;
    private _oUndoHandler!: UndoHandler;
    private _oSpacingPopover?: ResponsivePopover;
    
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
            canExportImg: true,
            showMinimap: false,
            canShowMinimap: false,
            canSearch: false,
            fullScreenIcon: "sap-icon://full-screen", // Default icon state
            hasHiddenNodes: false,
            isSelectMode: true,
            isFocusMode: false,
            focusNodeName: ""
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
        this._oExportHandler = new ExportHandler(oView, this._getText.bind(this), this._showError.bind(this));
        this._oFullScreenHandler = new FullScreenHandler(oView);
        this._oCanvasActionHandler = new CanvasActionHandler(oView, this.getOwnerComponent()?.getEventBus());
        this._oNoteDialogHandler = new NoteDialogHandler(oView);
        this._oUndoHandler = new UndoHandler(oView, this.getOwnerComponent()?.getEventBus());

        // Subscribe to global EventBus for incoming diagram payloads
        const oEventBus = this.getOwnerComponent()?.getEventBus();
        if (oEventBus) {
            oEventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this._onRenderRequest, this);
            oEventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.LIVE_FORMAT_UPDATE, this._onLiveFormatUpdate, this);
        }

        this._oFullScreenHandler.attachEvents();
        this._oCanvasActionHandler.attachEvents();
        this._oNoteDialogHandler.attachEvents();
        this._oUndoHandler.attachEvents();
    }

    /**
     * @public
     * @description Cleans up global event listeners to prevent memory leaks when the controller is destroyed.
     */
    public onExit(): void {
        const oEventBus = this.getOwnerComponent()?.getEventBus();
        if (oEventBus) {
            oEventBus.unsubscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this._onRenderRequest, this);
            oEventBus.unsubscribe(EventChannels.DIAGRAM_ENGINE, EventIds.LIVE_FORMAT_UPDATE, this._onLiveFormatUpdate, this);
        }
        this._oFullScreenHandler.detachEvents();
        this._oCanvasActionHandler.detachEvents();
        this._oNoteDialogHandler.detachEvents();
        this._oUndoHandler.detachEvents();
        
        if (this._oSpacingPopover) {
            this._oSpacingPopover.destroy();
            this._oSpacingPopover = undefined;
        }

        // CLEANUP: Destroy static engine instances and WebGL contexts to prevent memory leaks in the Fiori Launchpad
        Renderer.destroyActiveEngine();
    }

    /**
     * @private
     * @description Intercepts live format updates from the Selection panel and applies them directly to the active canvas.
     * @param {string} sChannel - Channel ID
     * @param {string} sEvent - Event ID
     * @param {any} oData - Format configuration data
     * @returns {void}
     */
    private _onLiveFormatUpdate(sChannel: string, sEvent: string, oData: any): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty("/hasDiagram")) {
            try {
                Renderer.updateLiveFormat(oData.engine, oData.format);
            } catch (oError: any) {
                this._showError(oError.message);
            }
        }
    }

    /**
     * @private
     * @description Core rendering routine. Triggered via EventBus.
     * @param {string} sChannel - Channel ID ('DiagramEngine')
     * @param {string} sEvent - Event ID ('RenderRequest')
     * @param {IRenderRequestPayload} oData - The payload containing syntax and metadata
     * @returns {void}
     */
    private _onRenderRequest(sChannel: string, sEvent: string, oEventData: any): void {
        const oData = oEventData as IRenderRequestPayload;
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        const oDataModel = this.getView()?.getModel("diagramData") as JSONModel;

        if (!oViewModel || !oDataModel) return;

        const bSupportsMinimap = Renderer.supportsMinimap(oData.engine);
        if (!bSupportsMinimap) {
            oViewModel.setProperty("/showMinimap", false);
            Renderer.toggleMinimap(oData.engine, false);
        }
        oViewModel.setProperty("/canShowMinimap", bSupportsMinimap);
        oViewModel.setProperty("/canSearch", Renderer.supportsSearch(oData.engine));

        this._resetState();

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

        // 2. Engine-specific UI validation
        if (oData.engine === EngineType.D2) {
            oViewModel.setProperty("/hasDiagram", true);
            oViewModel.setProperty("/canExportImg", false);
            this._showError("msgD2Warning");
            return;
        }

        // 3. Update UI state BEFORE calling the Renderer to prevent race conditions
        oViewModel.setProperty("/canExportImg", true);
        oViewModel.setProperty("/hasDiagram", true);
        
        const bIsDrillDown = !!(oData.rootCdsName && oData.cdsName !== oData.rootCdsName);
        oViewModel.setProperty("/isDrillDown", bIsDrillDown);
        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty("/isDrillDown", bIsDrillDown);
            if (oData.engineConfig?.presetPositions) oUiModel.setProperty("/formatCytoscape/layout_algorithm", "preset");
        }
        
        oViewModel.setProperty("/isSelectMode", false); // Re-enforce default tool on new renders

        if (oData.engineConfig) {
            oData.engineConfig.isDrillDown = bIsDrillDown;
        }

        // 4. Trigger the WASM/JS rendering engine
        try {
            const oHtml = this.byId("htmlRenderer") as HTML;
            Renderer.renderDiagram(oData.engine, oData.payload, oHtml, (sMsg: string) => this._showError(sMsg), oData.engineConfig);
        } catch (oError: any) {
            this._showError(oError.message);
        }
    }

    // ========================================================================
    // CANVAS ACTION DELEGATIONS
    // ========================================================================
    
    public onToggleFullScreen(): void { this._oFullScreenHandler.toggleFullScreen(this.byId("diagramContainer") as Control); }
    public onToggleMinimap(oEvent: Event): void { this._oCanvasActionHandler.toggleMinimap(oEvent); }
    public onChangeInteractionMode(oEvent: Event): void { this._oCanvasActionHandler.changeInteractionMode(oEvent); }
    public onSpacingChange(): void { this._oCanvasActionHandler.changeSpacing(); }
    public onClearFocus(): void { this._oCanvasActionHandler.clearSelection(); }
    public onAddNote(): void { this._oNoteDialogHandler.promptAddNote(); }

    public onOpenHiddenNodes(oEvent: Event): void {
        const oDialog = this.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.open();
    }

    public onCloseHiddenNodes(): void {
        const oDialog = this.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.close();
    }

    public onRestoreSelectedNodes(): void {
        this._oCanvasActionHandler.restoreSelectedNodes();
    }

    public onShowHiddenNodes(): void { 
        this._oCanvasActionHandler.showHiddenNodes(); 
        const oDialog = this.byId("popHiddenNodes") as Dialog;
        if (oDialog) {
            oDialog.close();
            (this.byId("listHiddenNodes") as List)?.removeSelections(true);
        }
    }

    /**
     * @public
     * @description Displays the Node Spacing slider in a localized Fiori Popover.
     * @param {Event} oEvent - Button press event.
     * @returns {void}
     */
    public onShowSpacing(oEvent: Event): void {
        if (!this._oSpacingPopover) {
            this._oSpacingPopover = new ResponsivePopover({
                showHeader: false,
                placement: "Top",
                contentWidth: "300px",
                verticalScrolling: false,
                horizontalScrolling: false,
                content: [
                    new Slider({ 
                        width: "260px",
                        value: "{ui>/formatCytoscape/node_spacing}", 
                        min: 50, max: 250, step: 25, enableTickmarks: true, 
                        change: this.onSpacingChange.bind(this) 
                    }).addStyleClass("sapUiSmallMargin")
                ]
            });
            this.getView()?.addDependent(this._oSpacingPopover);
        }
        this._oSpacingPopover.openBy(oEvent.getSource() as Control);
    }

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
    public onSearchCanvas(oEvent: SearchField$SearchEvent): void {
        const sQuery = oEvent.getParameter("query") || "";
        const sEngine = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/engine");
        
        Renderer.searchCanvas(sEngine, sQuery);
    }

    /**
     * @private
     * @description Displays error feedback on the canvas.
     * @param {string} sMessage - i18n key or raw error message.
     */
    private _showError(sMessage: string): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/hasError", true);
            oViewModel.setProperty("/errorText", this._getText(sMessage) || sMessage);
        }
    }

    /**
     * @private
     * @description Resets the canvas UI state before a fresh render.
     */
    private _resetState(): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/hasError", false);
            oViewModel.setProperty("/hasDiagram", false);
            oViewModel.setProperty("/isFocusMode", false);
            oViewModel.setProperty("/focusNodeName", "");
        }
    }

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
}