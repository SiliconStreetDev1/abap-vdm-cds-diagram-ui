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
     * Instantiates the ExportHandler.
     * @param {View} oView - Reference to the main view to access models.
     * @param {Function} fnGetText - Delegate function to retrieve translated i18n text.
     * @param {Function} fnShowError - Delegate function to handle error messaging.
     */
    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string, fnShowError: (m: string) => void) {
        this._oView = oView;
        this._fnGetText = fnGetText;
        this._fnShowError = fnShowError;
    }

    /**
     * Orchestrates the PNG export workflow via Canvas cloning and conversion.
     * It isolates the SVG from the live DOM, hardens its styling, and converts it to a high-res raster image.
     * @public
     */
    public async downloadPng(): Promise<void> {
        // Retrieve cached metadata (name, engine, payload) for the active diagram
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        
        // Target the live SVG rendered inside the HTML control
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg") as SVGSVGElement;

        // Abort if no diagram has been rendered yet
        if (!oSvg) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        BusyIndicator.show(0);
        try {
            // Clone the SVG node deeply. We do this so the CSS hardening process 
            // doesn't corrupt or alter the live diagram the user is currently looking at.
            const oClone = oSvg.cloneNode(true) as SVGSVGElement;
            
            // Inject external CSS stylesheets directly into the SVG clone as inline styles
            // and recalculate viewBox dimensions so it renders correctly outside the browser.
            Renderer.hardenSvgForDownload(oClone, oSvg);
            
            // Delegate the heavy lifting of drawing the SVG to a hidden HTML5 Canvas and extracting the Blob
            const oPngBlob = await Renderer.convertSvgToPng(oClone);

            // Generate a temporary, local URL representing the Blob data
            const url = URL.createObjectURL(oPngBlob);
            
            // Create a hidden anchor <a> tag, attach the Blob URL, and programmatically click it
            // to force the browser to trigger a standard file download dialog.
            const link = document.createElement("a");
            link.href = url;
            link.download = `${oData.cdsName}_${oData.engine}.png`;
            document.body.appendChild(link);
            link.click();
            
            // Cleanup the DOM and release the Blob memory to prevent memory leaks
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (oError) {
            this._fnShowError("PNG Export Failed: " + oError);
        } finally {
            BusyIndicator.hide();
        }
    }

    /**
     * Exports the hardened SVG file for native vector viewing.
     * Unlike PNG, this retains infinite scalability.
     * @public
     */
    public downloadSvg(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg") as SVGSVGElement;

        if (!oSvg) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        // Clone and harden the SVG to ensure CSS classes (like Mermaid themes) are baked in
        const oClone = oSvg.cloneNode(true) as SVGSVGElement;
        Renderer.hardenSvgForDownload(oClone, oSvg); 

        // Serialize the live DOM element back into a raw XML string
        const sSvgData = new XMLSerializer().serializeToString(oClone);
        
        // Wrap the XML string into a Blob with the correct SVG MIME type and character set
        const blob = new Blob([sSvgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        // Execute the programmatic anchor tag click hack to trigger the download
        const link = document.createElement("a");
        link.href = url;
        link.download = `${oData.cdsName}_${oData.engine}.svg`;
        document.body.appendChild(link);
        link.click();
        
        // Cleanup memory
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Transfers the raw diagram payload (e.g., PlantUML or Mermaid syntax) to the system clipboard.
     * @public
     */
    public copySyntax(): void {
        const sPayload: string = (this._oView.getModel("diagramData") as JSONModel).getProperty("/payload");
        
        // Safely check if the modern async clipboard API is supported by the browser
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show(this._fnGetText("msgCopied")));
        }
    }

    /**
     * Exports the raw text syntax as a local file (.txt, .puml, .mmd, etc.).
     * @public
     */
    public downloadSource(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        
        // Utilize the standard SAPUI5 File utility to trigger the download.
        // We strip the leading period from the extension (e.g., '.puml' -> 'puml') to satisfy the API.
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }
}