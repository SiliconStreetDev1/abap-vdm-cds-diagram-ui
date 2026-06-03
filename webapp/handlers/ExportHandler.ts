/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates logic for exporting diagrams to PNG, SVG, and Text.
 * @description Decouples export operations entirely from the active Fiori DOM. 
 * Re-routes all rendering requests through the headless `Renderer.generateExportSvg()` 
 * API to ensure exports never interfere with the active UI canvas and avoid Canvas CORS tainting.
 */

import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import File from "sap/ui/core/util/File";
import FileDownloadUtility from "../helpers/FileDownloadUtility";
import ViewStateHelper from "../helpers/ViewStateHelper";
import Renderer from "../renderer/Renderer";
import { EngineType } from "../types";

export default class ExportHandler {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;
    private _fnShowError: (m: string) => void;

    /**
     * @constructor
     * @param {View} oView - Reference to the active UI5 view.
     * @param {Function} fnGetText - Delegate function for i18n translations.
     * @param {Function} fnShowError - Delegate function for error handling.
     */
    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string, fnShowError: (m: string) => void) {
        this._oView = oView;
        this._fnGetText = fnGetText;
        this._fnShowError = fnShowError;
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
     * @description Orchestrates the PNG download. Triggers a headless re-render, 
     * pipes the standardized XML result through the PNG Canvas serializer, 
     * and triggers the browser download API.
     * @returns {Promise<void>}
     */
    public async downloadPng(): Promise<void> {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        
        if (!oData || !oData.engine) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        ViewStateHelper.toggleGlassPane(true, this._oView);

        try {
            if (Renderer.supportsNativePngExport(oData.engine)) {
                const b64Image = Renderer.exportPng(this._getInstanceId(), oData.engine);
                if (!b64Image) throw new Error("Canvas is empty or not initialized.");
                
                FileDownloadUtility.downloadFromUrl(b64Image, `${oData.cdsName}_${oData.engine}.png`);
                
            } else {
                // Request a brand new, clean SVG string from the isolated headless engine
                const sCleanSvgData = await Renderer.generateExportSvg(this._getInstanceId(), oData.engine, oData.payload);
                if (!sCleanSvgData) throw new Error("Headless SVG generation failed.");

                // Rasterize the pure string into a PNG Blob via the ExportUtility
                const oPngBlob = await Renderer.convertSvgStringToPng(sCleanSvgData);
                FileDownloadUtility.downloadBlob(oPngBlob, `${oData.cdsName}_${oData.engine}.png`);
            }
        } catch (oError: any) {
            this._fnShowError("PNG Export Failed: " + (oError.message || oError));
        } finally {
            ViewStateHelper.toggleGlassPane(false, this._oView);
        }
    }

    /**
     * @public
     * @description Orchestrates the SVG vector download. Triggers a headless re-render, 
     * standardizes the XML payload via the SvgProcessor, and triggers the browser download API.
     * @returns {Promise<void>}
     */
    public async downloadSvg(): Promise<void> {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();

        if (!oData || !oData.engine) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        ViewStateHelper.toggleGlassPane(true, this._oView);

        try {
            // Request a brand new, clean SVG string from the isolated headless engine
            const sSvgData = await Renderer.generateExportSvg(this._getInstanceId(), oData.engine, oData.payload);
            if (!sSvgData) throw new Error("Headless SVG generation failed.");

            // Convert the standard XML string into a downloadable File Blob
            const blob = new Blob([sSvgData], { type: "image/svg+xml;charset=utf-8" });
            FileDownloadUtility.downloadBlob(blob, `${oData.cdsName}_${oData.engine}.svg`);

        } catch (oError: any) {
            this._fnShowError("SVG Export Failed: " + (oError.message || oError));
        } finally {
            ViewStateHelper.toggleGlassPane(false, this._oView);
        }
    }

    /**
     * @public
     * @description Copies the raw backend payload (e.g., PlantUML Syntax, DOT Syntax, JSON) 
     * directly to the user's system clipboard.
     * @returns {void}
     */
    public copySyntax(): void {
        const sPayload: string = (this._oView.getModel("diagramData") as JSONModel).getProperty("/payload");
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(sPayload)
                .then(() => MessageToast.show(this._fnGetText("msgCopied")))
                .catch((e: any) => this._fnShowError("Clipboard Access Denied: " + (e.message || "Check browser permissions.")));
        } else {
            this._fnShowError("Clipboard API is not supported in this browser context.");
        }
    }

    /**
     * @public
     * @description Downloads the raw backend payload to a local text file utilizing the 
     * specific engine's file extension (e.g., .puml, .dot, .mmd).
     * @returns {void}
     */
    public downloadSource(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        if (!oData || !oData.payload) return;
        
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }
}