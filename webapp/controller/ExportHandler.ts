/**
 * @fileoverview Encapsulates logic for exporting diagrams to PNG, SVG, and Text.
 * @version 1.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import File from "sap/ui/core/util/File";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Renderer from "../util/Renderer";

export default class ExportHandler {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;
    private _fnShowError: (m: string) => void;

    /**
     * @param {View} oView - Reference to the main view.
     * @param {Function} fnGetText - i18n translation delegate.
     * @param {Function} fnShowError - Error display delegate.
     */
    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string, fnShowError: (m: string) => void) {
        this._oView = oView;
        this._fnGetText = fnGetText;
        this._fnShowError = fnShowError;
    }

    /**
     * Orchestrates the PNG export workflow via Canvas cloning and conversion.
     * @public
     */
    public async downloadPng(): Promise<void> {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg") as SVGSVGElement;

        if (!oSvg) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        BusyIndicator.show(0);
        try {
            const oClone = oSvg.cloneNode(true) as SVGSVGElement;
            Renderer.hardenSvgForDownload(oClone, oSvg);
            const oPngBlob = await Renderer.convertSvgToPng(oClone);

            const url = URL.createObjectURL(oPngBlob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${oData.cdsName}_${oData.engine}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (oError) {
            this._fnShowError("PNG Export Failed: " + oError);
        } finally {
            BusyIndicator.hide();
        }
    }

    /**
     * Exports the hardened SVG file for vector viewing.
     * @public
     */
    public downloadSvg(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg") as SVGSVGElement;

        if (!oSvg) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        const oClone = oSvg.cloneNode(true) as SVGSVGElement;
        Renderer.hardenSvgForDownload(oClone, oSvg); 

        const sSvgData = new XMLSerializer().serializeToString(oClone);
        const blob = new Blob([sSvgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `${oData.cdsName}_${oData.engine}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Transfers the diagram raw payload to the system clipboard.
     * @public
     */
    public copySyntax(): void {
        const sPayload: string = (this._oView.getModel("diagramData") as JSONModel).getProperty("/payload");
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show(this._fnGetText("msgCopied")));
        }
    }

    /**
     * Exports the raw text syntax as a local file.
     * @public
     */
    public downloadSource(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }
}