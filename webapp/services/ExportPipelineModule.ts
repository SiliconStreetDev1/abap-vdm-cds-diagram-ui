/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.services
 * @fileoverview Single cohesive Export Pipeline Module.
 * @description Consolidates SvgProcessor, FileDownloadUtility, ExportUtility, and ExportHandler 
 * into one linear workflow for generating, sanitizing, converting, and downloading diagrams.
 */

import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import File from "sap/ui/core/util/File";
import ViewStateHelper from "../helpers/ViewStateHelper";
import Renderer from "../renderer/Renderer";
import { DiagramData } from "../constants/StateConstants";

export default class ExportPipelineModule {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;
    private _fnShowError: (m: string) => void;

    /**
     * @constructor
     * @param {View} activeView - Reference to the active UI5 view.
     * @param {Function} getTextDelegate - Delegate function for i18n translations.
     * @param {Function} fnShowError - Delegate function for error handling.
     */
    constructor(activeView: View, getTextDelegate: (k: string, args?: any[]) => string, fnShowError: (m: string) => void) {
        this._oView = activeView;
        this._fnGetText = getTextDelegate;
        this._fnShowError = fnShowError;
    }

    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    /**
     * @public
     * @description Orchestrates the PNG download pipeline.
     */
    public async downloadPng(): Promise<void> {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        if (!oData || !oData.engine) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        ViewStateHelper.setAppBusy(true, this._oView, "Generating high-resolution PNG... Please wait.");
        
        try {
            if (Renderer.supportsNativePngExport(oData.engine)) {
                const b64Image = Renderer.exportPng(this._getInstanceId(), oData.engine);
                if (!b64Image) throw new Error("Canvas is empty or not initialized.");
                this._downloadFromUrl(b64Image, `${oData.cdsName}_${oData.engine}.png`);
            } else {
                const sRawSvg = await Renderer.generateRawExportSvg(this._getInstanceId(), oData.engine, oData.payload);
                if (!sRawSvg) throw new Error("Headless SVG generation failed.");

                const sCleanSvgData = this._standardizeSvg(sRawSvg);
                const oPngBlob = await this._convertSvgStringToPngBlob(sCleanSvgData);
                this._downloadBlob(oPngBlob, `${oData.cdsName}_${oData.engine}.png`);
            }
        } catch (oError: any) {
            this._fnShowError("PNG Export Failed: " + (oError.message || oError));
        } finally {
            ViewStateHelper.setAppBusy(false, this._oView);
        }
    }

    /**
     * @public
     * @description Orchestrates the SVG vector download pipeline.
     */
    public async downloadSvg(): Promise<void> {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        if (!oData || !oData.engine) {
            MessageToast.show(this._fnGetText("msgEmptyTitle"));
            return;
        }

        ViewStateHelper.setAppBusy(true, this._oView, "Generating high-resolution SVG... Please wait.");

        try {
            const sRawSvg = await Renderer.generateRawExportSvg(this._getInstanceId(), oData.engine, oData.payload);
            if (!sRawSvg) throw new Error("Headless SVG generation failed.");

            const sCleanSvgData = this._standardizeSvg(sRawSvg);
            const blob = new Blob([sCleanSvgData], { type: "image/svg+xml;charset=utf-8" });
            this._downloadBlob(blob, `${oData.cdsName}_${oData.engine}.svg`);
        } catch (oError: any) {
            this._fnShowError("SVG Export Failed: " + (oError.message || oError));
        } finally {
            ViewStateHelper.setAppBusy(false, this._oView);
        }
    }

    /**
     * @public
     * @description Copies the raw backend payload to the user's system clipboard.
     */
    public copySyntax(): void {
        const payload: string = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.PAYLOAD);
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(payload)
                .then(() => MessageToast.show(this._fnGetText("msgCopied")))
                .catch((e: any) => this._fnShowError("Clipboard Access Denied: " + (e.message || "Check browser permissions.")));
        } else {
            this._fnShowError("Clipboard API is not supported in this browser context.");
        }
    }

    /**
     * @public
     * @description Downloads the raw backend payload to a local text file.
     */
    public downloadSource(): void {
        const oData = (this._oView.getModel("diagramData") as JSONModel).getData();
        if (!oData || !oData.payload) return;
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }

    // ========================================================================
    // INTERNAL PIPELINE UTILITIES
    // ========================================================================

    /**
     * @private
     * @description Cleans and standardizes the raw SVG string from the layout engine.
     * Removes unsupported inline styles and ensures proper XML namespaces.
     * @param {string} sRawSvg - The raw SVG string.
     * @returns {string} The standardized SVG string.
     */
    private _standardizeSvg(sRawSvg: string): string {
        const sPreCleanedSvg = sRawSvg.replace(/&nbsp;/gi, "&#160;");
        const oParser = new DOMParser();
        const oDoc = oParser.parseFromString(sPreCleanedSvg, "image/svg+xml");
        
        const oParserError = oDoc.querySelector("parsererror");
        if (oParserError) throw new Error(`SVG XML Document parsing failed: ${oParserError.textContent}`);

        const oSvgNode = oDoc.documentElement as unknown as SVGSVGElement;
        this._removeNonElementNodes(oDoc);

        if (!oSvgNode.getAttribute("xmlns")) oSvgNode.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        if (!oSvgNode.getAttribute("xmlns:xlink")) oSvgNode.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

        if (oSvgNode.getAttribute("preserveAspectRatio") === "none") {
            oSvgNode.removeAttribute("preserveAspectRatio");
        }

        let sInlineStyle = oSvgNode.getAttribute("style") || "";
        sInlineStyle = sInlineStyle.replace(/margin\s*:[^;]+;?/gi, "").replace(/display\s*:[^;]+;?/gi, "");
        sInlineStyle += " display: block; margin: 0 auto;";
        oSvgNode.setAttribute("style", sInlineStyle.trim());

        const aScripts = oSvgNode.querySelectorAll("script");
        aScripts.forEach((oScript) => oScript.parentNode?.removeChild(oScript));

        return new XMLSerializer().serializeToString(oDoc);
    }

    /**
     * @private
     * @description Recursively removes non-element nodes (like comments and processing instructions) from the SVG DOM.
     * @param {Node} oNode - The current DOM node to process.
     */
    private _removeNonElementNodes(oNode: Node): void {
        let i = oNode.childNodes.length;
        while (i--) {
            const oChild = oNode.childNodes[i];
            if (oChild.nodeType === 8 || oChild.nodeType === 7) oNode.removeChild(oChild);
            else if (oChild.nodeType === 1) this._removeNonElementNodes(oChild);
        }
    }

    /**
     * @private
     * @description Converts a sanitized SVG string into a high-resolution PNG Blob using the HTML5 Canvas API.
     * @param {string} sSvgData - The clean SVG XML string.
     * @returns {Promise<Blob>} Promise resolving to the binary PNG Blob.
     */
    private _convertSvgStringToPngBlob(sSvgData: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            let sCleanSvgData = sSvgData.replace(/@import url\([^)]+\);?/gi, "").replace(/<image[^>]+href="http[^>]+>/gi, "");
            const parser = new DOMParser();
            const doc = parser.parseFromString(sCleanSvgData, "image/svg+xml");
            const oSvg = doc.documentElement as unknown as SVGSVGElement;

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Failed to acquire Canvas 2D context."));

            let width = 3000, height = 3000;
            const viewBox = oSvg.getAttribute("viewBox");
            if (viewBox) {
                const parts = viewBox.split(/\s+|,/).filter(Boolean);
                if (parts.length >= 4) { width = parseFloat(parts[2]); height = parseFloat(parts[3]); }
            } else {
                width = parseFloat(oSvg.getAttribute("width") || "") || width;
                height = parseFloat(oSvg.getAttribute("height") || "") || height;
            }

            oSvg.setAttribute("width", `${width}px`);
            oSvg.setAttribute("height", `${height}px`);
            sCleanSvgData = new XMLSerializer().serializeToString(doc);

            let scale = 2;
            const MAX_DIMENSION = 8192, MAX_AREA = 16777216;
            while ((width * scale > MAX_DIMENSION || height * scale > MAX_DIMENSION || (width * scale * height * scale) > MAX_AREA) && scale > 0.5) {
                scale -= 0.5;
            }

            canvas.width = width * scale;
            canvas.height = height * scale;
            ctx.scale(scale, scale);

            const img = new Image();
            img.src = "data:image/svg+xml;base64," + btoa(Array.from(new TextEncoder().encode(sCleanSvgData), b => String.fromCharCode(b)).join(""));

            img.onload = () => {
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0);
                img.removeAttribute("src");
                try {
                    canvas.toBlob((blob) => {
                        canvas.width = 0; canvas.height = 0;
                        if (blob) resolve(blob); else reject(new Error("Image too massive for pixel rendering. Use SVG Download instead."));
                    }, "image/png");
                } catch (e: any) { reject(new Error(`Canvas Export Error: ${e.message}`)); }
            };
            img.onerror = () => reject(new Error("Failed to parse sanitized SVG Data URI."));
        });
    }

    /**
     * @private
     * @description Triggers a file download in the browser from a given URL or Data URI.
     * @param {string} sUrl - The URL or Data URI to download.
     * @param {string} sFileName - The target filename.
     */
    private _downloadFromUrl(sUrl: string, sFileName: string): void {
        const link = document.createElement("a");
        link.href = sUrl; link.download = sFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * @private
     * @description Creates an object URL for a Blob and triggers its download, then cleans up the URL.
     * @param {Blob} oBlob - The binary Blob to download.
     * @param {string} sFileName - The target filename.
     */
    private _downloadBlob(oBlob: Blob, sFileName: string): void {
        const url = URL.createObjectURL(oBlob);
        this._downloadFromUrl(url, sFileName);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
}
