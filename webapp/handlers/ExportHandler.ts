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
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Renderer from "../renderer/Renderer";
import CytoscapeEngine from "../renderer/engines/CytoscapeEngine";

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

        BusyIndicator.show(0);

        try {
            if (oData.engine === "CYTOSCAPE") {
                // Cytoscape manages its own internal Canvas state for PNG exports
                const b64Image = CytoscapeEngine.exportPng();
                if (!b64Image) throw new Error("Canvas is empty or not initialized.");
                
                const link = document.createElement("a");
                link.href = b64Image;
                link.download = `${oData.cdsName}_${oData.engine}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
            } else {
                // Request a brand new, clean SVG string from the isolated headless engine
                const sCleanSvgData = await Renderer.generateExportSvg(oData.engine, oData.payload);
                if (!sCleanSvgData) throw new Error("Headless SVG generation failed.");

                // Rasterize the pure string into a PNG Blob via the ExportUtility
                const oPngBlob = await Renderer.convertSvgStringToPng(sCleanSvgData);
                const url = URL.createObjectURL(oPngBlob);
                
                const link = document.createElement("a");
                link.href = url;
                link.download = `${oData.cdsName}_${oData.engine}.png`;
                document.body.appendChild(link);
                link.click();
                
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        } catch (oError: any) {
            this._fnShowError("PNG Export Failed: " + (oError.message || oError));
        } finally {
            BusyIndicator.hide();
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

        BusyIndicator.show(0);

        try {
            let sSvgData = "";

            if (oData.engine === "CYTOSCAPE") {
                sSvgData = CytoscapeEngine.exportSvg();
                if (!sSvgData) throw new Error("SVG Export Failed. Ensure the cytoscape-svg plugin is loaded.");
            } else {
                // Request a brand new, clean SVG string from the isolated headless engine
                sSvgData = await Renderer.generateExportSvg(oData.engine, oData.payload);
                if (!sSvgData) throw new Error("Headless SVG generation failed.");
            }

            // Convert the standard XML string into a downloadable File Blob
            const blob = new Blob([sSvgData], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `${oData.cdsName}_${oData.engine}.svg`;
            document.body.appendChild(link);
            link.click();
            
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (oError: any) {
            this._fnShowError("SVG Export Failed: " + (oError.message || oError));
        } finally {
            BusyIndicator.hide();
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
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show(this._fnGetText("msgCopied")));
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