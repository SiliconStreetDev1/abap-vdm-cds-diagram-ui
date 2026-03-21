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

import ExportHandler from "./ExportHandler";
import Renderer from "../renderer/Renderer";

export default class Diagram extends Controller {
    
    /** @private {ExportHandler} Service for managing file downloads and clipboard actions */
    private _oExportHandler!: ExportHandler;

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
            fullScreenIcon: "sap-icon://full-screen" // Default icon state
        }), "view");
        
        // Data model storage required for ExportHandler operations
        oView.setModel(new JSONModel({ 
            payload: "", 
            extension: "", 
            cdsName: "", 
            engine: "" 
        }), "diagramData");

        // Initialize the export service
        this._oExportHandler = new ExportHandler(oView, this._getText.bind(this), this._showError.bind(this));

        // Subscribe to global EventBus for incoming diagram payloads
        const oEventBus = this.getOwnerComponent()?.getEventBus();
        if (oEventBus) {
            oEventBus.subscribe("DiagramEngine", "RenderRequest", this._onRenderRequest, this);
        }

        // Attach native DOM listeners to catch when a user presses 'ESC' to exit fullscreen natively
        document.addEventListener("fullscreenchange", this._onFullScreenChange.bind(this));
        document.addEventListener("webkitfullscreenchange", this._onFullScreenChange.bind(this)); // Safari fallback
    }

    /**
     * @private
     * @description Core rendering routine. Triggered via EventBus.
     * @param {string} sChannel - Channel ID ('DiagramEngine')
     * @param {string} sEvent - Event ID ('RenderRequest')
     * @param {any} oData - The payload containing syntax and metadata
     * @returns {void}
     */
    private _onRenderRequest(sChannel: string, sEvent: string, oData: any): void {
        const oViewModel = this.getView()?.getModel("view") as JSONModel;
        const oDataModel = this.getView()?.getModel("diagramData") as JSONModel;

        this._resetState();

        // 1. Persist the payload for export operations
        oDataModel.setData({
            payload: oData.payload,
            extension: oData.extension,
            cdsName: oData.cdsName,
            engine: oData.engine
        });

        // 2. Engine-specific UI validation
        if (oData.engine === "D2") {
            this._showError("msgD2Warning");
            return;
        }

        // 3. Update UI state BEFORE calling the Renderer to prevent race conditions
        oViewModel.setProperty("/canExportImg", oData.engine !== "D2");
        oViewModel.setProperty("/hasDiagram", true);

        // 4. Trigger the WASM/JS rendering engine
        try {
            const oHtml = this.byId("htmlRenderer") as HTML;
            Renderer.renderDiagram(oData.engine, oData.payload, oHtml, (sMsg: string) => this._showError(sMsg));
        } catch (oError: any) {
            this._showError(oError.message);
        }
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

        // Fetch the raw physical DOM element
        const oDomRef = oContainer.getDomRef() as any;
        if (!oDomRef) return;

        if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
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
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            } else if ((document as any).msExitFullscreen) {
                (document as any).msExitFullscreen();
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

        // Check active fullscreen element
        if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
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
        oViewModel.setProperty("/hasDiagram", false);
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
     * @returns {string} Translated text.
     */
    private _getText(sKey: string): string {
        const oBundle = (this.getOwnerComponent()?.getModel("i18n") as any)?.getResourceBundle();
        return oBundle ? oBundle.getText(sKey) || sKey : sKey;
    }

    // ========================================================================
    // EXPORT DELEGATIONS
    // ========================================================================

    public onDownloadPng(): void   { this._oExportHandler.downloadPng(); }
    public onDownloadImage(): void { this._oExportHandler.downloadSvg(); }
    public onDownloadSource(): void{ this._oExportHandler.downloadSource(); }
    public onCopySyntax(): void    { this._oExportHandler.copySyntax(); }
}