/**
 * @fileoverview Encapsulates logic for exporting diagrams to PNG, SVG, and Text.
 * @version 2.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 * @description Updated to support both SVG-based engines (PlantUML/Mermaid) 
 * and Canvas-based engines (Cytoscape).
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

    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string, fnShowError: (m: string) => void) {
        this._oView = oView;
        this._fnGetText = fnGetText;
        this._fnShowError = fnShowError;
    }

    /**
     * @public
     * @description Orchestrates the PNG export workflow, branching logic based on the active engine.
     */
    public async downloadPng(): Promise<void> {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        
        if (!oData || !oData.engine) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        BusyIndicator.show(0);

        try {
            // BRANCH 1: CANVAS EXPORT (CYTOSCAPE)
            if (oData.engine === "CYTOSCAPE") {
                const b64Image = CytoscapeEngine.exportPng();
                if (!b64Image) throw new Error("Canvas is empty or not initialized.");
                
                const link = document.createElement("a");
                link.href = b64Image;
                link.download = `${oData.cdsName}_${oData.engine}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
            } else {
                // BRANCH 2: SVG EXPORT (MERMAID / PLANTUML)
                const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg") as SVGSVGElement;
                if (!oSvg) throw new Error("SVG element not found in DOM.");

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
            }
        } catch (oError) {
            this._fnShowError("PNG Export Failed: " + oError);
        } finally {
            BusyIndicator.hide();
        }
    }

    /**
     * @public
     * @description Exports the hardened SVG file. Blocks Cytoscape as it uses Canvas.
     */
    public downloadSvg(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();

        if (oData.engine === "CYTOSCAPE") {
            this._fnShowError("Vector (SVG) export is not supported for Interactive Canvas engines. Please use PNG export.");
            return;
        }

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
     * @public
     */
    public copySyntax(): void {
        const sPayload: string = (this._oView.getModel("diagramData") as JSONModel).getProperty("/payload");
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show(this._fnGetText("msgCopied")));
        }
    }

    /**
     * @public
     */
    public downloadSource(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }
}