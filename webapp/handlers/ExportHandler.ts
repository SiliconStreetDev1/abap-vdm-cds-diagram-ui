
/**
 * @fileoverview Encapsulates logic for exporting diagrams to PNG, SVG, and Text.
 * @description Updated to process raw SVG strings dynamically from the Cytoscape 
 * Canvas architecture using the cytoscape-svg extension, removing old legacy blocks.
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

    public async downloadPng(): Promise<void> {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        
        if (!oData || !oData.engine) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        BusyIndicator.show(0);

        try {
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

    public downloadSvg(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();

        if (!oData || !oData.engine) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        // 1. Process Cytoscape using the new cytoscape-svg plugin
        if (oData.engine === "CYTOSCAPE") {
            const sSvgData = CytoscapeEngine.exportSvg();
            
            if (!sSvgData) {
                this._fnShowError("SVG Export Failed. Ensure the cytoscape-svg plugin is loaded.");
                return;
            }
            
            const blob = new Blob([sSvgData], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `${oData.cdsName}_${oData.engine}.svg`;
            document.body.appendChild(link);
            link.click();
            
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            return;
        }

        // 2. Process Standard Engines (Mermaid, Graphviz, PlantUML)
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

    public copySyntax(): void {
        const sPayload: string = (this._oView.getModel("diagramData") as JSONModel).getProperty("/payload");
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show(this._fnGetText("msgCopied")));
        }
    }

    public downloadSource(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        if (!oData || !oData.payload) return;
        
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }
}