/**
 * @fileoverview VDM / CDS Diagram Engine Renderer (Façade)
 * @author Silicon Street Limited
 * * @description Serves as the primary public API for the UI5 Controller, shielding it 
 * from the underlying complexities of dynamic script injection, asynchronous DOM rendering, 
 * and engine-specific initializations. 
 * * Implements the Façade Design Pattern by delegating execution to isolated, 
 * single-responsibility domain classes.
 */

import HTML from "sap/ui/core/HTML";
import DomManager from "./DomManager";
import MermaidEngine from "../engines/MermaidEngine";
import GraphvizEngine from "../engines/GraphvizEngine";
import PlantUmlEngine from "../engines/PlantUmlEngine";
import ExportUtility from "./ExportUtility";

export default class Renderer {

    /**
     * @public
     * @description Core routing method. Validates the UI5 DOM state via the DomManager, 
     * then dispatches the raw syntax payload to the appropriate engine implementation.
     * * @param {string} sEngine - Engine identifier ("MERMAID", "GRAPHVIZ", "PLANTUML").
     * @param {string} sPayload - The source code syntax to render.
     * @param {HTML} oHtmlControl - The UI5 HTML wrapper control.
     * @param {(msg: string) => void} fnOnError - Callback to dispatch errors to the UI5 Message Manager.
     * @returns {void}
     */
    public static renderDiagram(sEngine: string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void): void {
        DomManager.setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            switch (sEngine) {
                case "MERMAID":
                    MermaidEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                case "GRAPHVIZ":
                    GraphvizEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                case "PLANTUML":
                    PlantUmlEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                default:
                    fnOnError(`Unsupported rendering engine: ${sEngine}`);
            }
        });
    }

    /**
     * @public
     * @description Façade method for exporting diagrams. Delegates to the ExportUtility 
     * to safely rasterize the SVG vector graphic into a PNG Blob, handling dynamic 
     * downscaling to prevent browser out-of-memory exceptions on massive CDS views.
     * * @param {SVGSVGElement} oSvg - The live SVG DOM element to be converted.
     * @returns {Promise<Blob>} A promise resolving to the PNG Blob payload.
     */
    public static convertSvgToPng(oSvg: SVGSVGElement): Promise<Blob> {
        return ExportUtility.convertSvgToPng(oSvg);
    }

    /**
     * @public
     * @description Façade method for raw vector exporting. Delegates to the ExportUtility 
     * to inline computed styles and secure the coordinate system (ViewBox) prior to download.
     * * @param {SVGSVGElement} oClone - A detached clone of the target SVG destined for the user's filesystem.
     * @param {SVGSVGElement} oOriginalSvg - The live DOM SVG utilized to compute current rendering styles.
     * @returns {void}
     */
    public static hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
        ExportUtility.hardenSvgForDownload(oClone, oOriginalSvg);
    }
}