/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Standalone Canvas Controller for V2 Architecture.
 * @version 2.5
 * @description Manages the rendering lifecycle of CDS diagrams, true OS-level 
 * fullscreen capabilities, and delegates export actions to the ExportHandler.
 */

import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import HTML from "sap/ui/core/HTML";
import Event from "sap/ui/base/Event";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Link from "sap/m/Link";
import ToggleButton from "sap/m/ToggleButton";

import ExportHandler from "../handlers/ExportHandler";
import Renderer from "../renderer/Renderer";
import { EngineType, IRenderRequestPayload } from "../types";

export default class Diagram extends Controller {
    
    /** @private {ExportHandler} Service for managing file downloads and clipboard actions */
    private _oExportHandler!: ExportHandler;
    
    // Bound event listener references for proper cleanup
    private _fnFullScreenChangeBind!: EventListener;
    private _fnCloseMinimapRequestBind!: EventListener;
    private _fnLayoutUnlockedBind!: EventListener;

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
            nodesLocked: false
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

        // Subscribe to global EventBus for incoming diagram payloads
        const oEventBus = this.getOwnerComponent()?.getEventBus();
        if (oEventBus) {
            oEventBus.subscribe("DiagramEngine", "RenderRequest", this._onRenderRequest, this);
            oEventBus.subscribe("DiagramEngine", "LiveFormatUpdate", this._onLiveFormatUpdate, this);
        }

        this._fnFullScreenChangeBind = this._onFullScreenChange.bind(this);
        this._fnCloseMinimapRequestBind = this._onCloseMinimapRequest.bind(this) as EventListener;
        this._fnLayoutUnlockedBind = this._onLayoutUnlocked.bind(this) as EventListener;

        // Attach native DOM listeners to catch when a user presses 'ESC' to exit fullscreen natively
        document.addEventListener("fullscreenchange", this._fnFullScreenChangeBind);
        document.addEventListener("webkitfullscreenchange", this._fnFullScreenChangeBind); // Safari fallback
        document.addEventListener("CdsCloseMinimapRequest", this._fnCloseMinimapRequestBind);
        document.addEventListener("CdsLayoutUnlocked", this._fnLayoutUnlockedBind);
    }

    /**
     * @public
     * @description Cleans up global event listeners to prevent memory leaks when the controller is destroyed.
     */
    public onExit(): void {
        const oEventBus = this.getOwnerComponent()?.getEventBus();
        if (oEventBus) {
            oEventBus.unsubscribe("DiagramEngine", "RenderRequest", this._onRenderRequest, this);
            oEventBus.unsubscribe("DiagramEngine", "LiveFormatUpdate", this._onLiveFormatUpdate, this);
        }
        document.removeEventListener("fullscreenchange", this._fnFullScreenChangeBind);
        document.removeEventListener("webkitfullscreenchange", this._fnFullScreenChangeBind);
        document.removeEventListener("CdsCloseMinimapRequest", this._fnCloseMinimapRequestBind);
        document.removeEventListener("CdsLayoutUnlocked", this._fnLayoutUnlockedBind);
        
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
        oViewModel.setProperty("/isDrillDown", !!(oData.rootCdsName && oData.cdsName !== oData.rootCdsName));
        // Automatically engage lock state if coordinates were loaded
        oViewModel.setProperty("/nodesLocked", !!oData.engineConfig?.presetPositions);

        // 4. Trigger the WASM/JS rendering engine
        try {
            const oHtml = this.byId("htmlRenderer") as HTML;
            Renderer.renderDiagram(oData.engine, oData.payload, oHtml, (sMsg: string) => this._showError(sMsg), oData.engineConfig);
        } catch (oError: any) {
            this._showError(oError.message);
        }
    }

    /**
     * @public
     * @description Explicitly toggles the physics locks on all nodes.
     */
    public onToggleNodeLock(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        (this.getView()?.getModel("view") as JSONModel).setProperty("/nodesLocked", bPressed);
        
        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        const sEngine = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/engine");
        
        if (!bPressed) {
            if (oUiModel) oUiModel.setProperty("/formatCytoscape/presetPositions", null);
        } else {
            const oCanvasState = Renderer.getCanvasState(sEngine);
            if (oUiModel && oCanvasState) oUiModel.setProperty("/formatCytoscape/presetPositions", oCanvasState);
        }
        
        Renderer.setNodesLocked(sEngine, bPressed);
    }

    /**
     * @public
     * @description Forces the layout engine to completely recalculate for all unlocked nodes.
     */
    public onRelayout(): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        oViewModel.setProperty("/nodesLocked", false);
        
        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/formatCytoscape/presetPositions", null);
        
        const sEngine = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.setNodesLocked(sEngine, false);
        Renderer.runLayout(sEngine);
    }

    /**
     * @public
     * @description Triggers true OS-level HTML5 Fullscreen on the Diagram Canvas.
     * Targets the specific container ID to ensure only the canvas maximizes.
     * @returns {void}
     */
    public onToggleFullScreen(): void {
        const oContainer = this.byId("diagramContainer");
        if (!oContainer) return;

        type FullscreenElement = HTMLElement & {
            requestFullscreen?: () => Promise<void>;
            webkitRequestFullscreen?: () => void;
            msRequestFullscreen?: () => void;
        };
        type FullscreenDoc = Document & {
            webkitFullscreenElement?: Element;
            webkitExitFullscreen?: () => void;
            msExitFullscreen?: () => void;
        };

        const oDomRef = oContainer.getDomRef() as FullscreenElement;
        if (!oDomRef) return;

        const doc = document as FullscreenDoc;

        if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
            // Enter Fullscreen (with cross-browser fallbacks)
            if (oDomRef.requestFullscreen) {
                oDomRef.requestFullscreen().catch((err: Error) => console.warn(`Fullscreen error: ${err.message}`));
            } else if (oDomRef.webkitRequestFullscreen) { 
                oDomRef.webkitRequestFullscreen();
            } else if (oDomRef.msRequestFullscreen) {
                oDomRef.msRequestFullscreen();
            }
        } else {
            // Exit Fullscreen
            if (doc.exitFullscreen) {
                doc.exitFullscreen();
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
        }
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
                oEventBus.publish("DiagramEngine", "NodeDrillDownRequest", { viewName: sViewName });
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
     * @description Event handler for close minimap custom event
     */
    private _onCloseMinimapRequest(): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/showMinimap", false);
        }
        const sEngine = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.toggleMinimap(sEngine, false);
    }

    /**
     * @private
     * @description Event handler for layout unlocked custom event
     */
    private _onLayoutUnlocked(): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty("/nodesLocked", false);
        
        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/formatCytoscape/presetPositions", null);
    }

    /**
     * @public
     * @description Toggles the minimap display
     */
    public onToggleMinimap(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        (this.getView()?.getModel("view") as JSONModel).setProperty("/showMinimap", bPressed);
        const sEngine = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.toggleMinimap(sEngine, bPressed);
    }

    /**
     * @public
     * @description Handles live node spacing changes from the floating slider on the canvas.
     * Only fires on slider drop (`change`) to prevent layout calculation stutter.
     */
    public onSpacingChange(oEvent: Event): void {
        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        if (oUiModel) {
            const oFormatConfig = Object.assign({}, oUiModel.getProperty("/formatCytoscape"));
            const oEventBus = this.getOwnerComponent()?.getEventBus();
            if (oEventBus) {
                oEventBus.publish("DiagramEngine", "LiveFormatUpdate", { engine: EngineType.CYTOSCAPE, format: oFormatConfig });
            }
        }
    }

    /**
     * @private
     * @description Keeps the UI button icon in sync with the browser's fullscreen state.
     * This ensures the icon flips back if the user presses the 'ESC' key.
     * @returns {void}
     */
    private _onFullScreenChange(): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        if (!oViewModel) return;

        type FullscreenDoc = Document & { webkitFullscreenElement?: Element; };
        const doc = document as FullscreenDoc;

        // Check active fullscreen element
        if (doc.fullscreenElement || doc.webkitFullscreenElement) {
            oViewModel.setProperty("/fullScreenIcon", "sap-icon://exit-full-screen");
        } else {
            oViewModel.setProperty("/fullScreenIcon", "sap-icon://full-screen");
        }
    }

    /**
     * @private
     * @description Displays error feedback on the canvas.
     * @param {string} sMessage - i18n key or raw error message.
     */
    private _showError(sMessage: string): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        oViewModel.setProperty("/hasError", true);
        oViewModel.setProperty("/errorText", this._getText(sMessage) || sMessage);
    }

    /**
     * @private
     * @description Resets the canvas UI state before a fresh render.
     */
    private _resetState(): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        oViewModel.setProperty("/hasError", false);
        oViewModel.setProperty("/hasDiagram", false);
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