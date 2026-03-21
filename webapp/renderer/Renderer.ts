/**
 * @fileoverview VDM / CDS Diagram Engine Renderer (Façade)
 * @author Silicon Street Limited
 * @description Serves as the primary public API. Orchestrates the asynchronous 
 * configuration loading process before delegating tasks to specialized engines.
 */

import HTML from "sap/ui/core/HTML";
import DomManager from "./DomManager";
import MermaidEngine from "./engines/MermaidEngine";
import GraphvizEngine from "./engines/GraphvizEngine";
import PlantUmlEngine from "./engines/PlantUmlEngine";
import CytoscapeEngine from "./engines/CytoscapeEngine"; // <-- NEW: Import the interactive engine
import ExportUtility from "./ExportUtility";
import ConfigManager from "./ConfigManager";

export default class Renderer {

    /**
     * @public
     * @description Asynchronously initializes the configuration manager and routes the rendering request.
     * @param {string} sEngine - Engine identifier ("MERMAID", "GRAPHVIZ", "PLANTUML", "CYTOSCAPE").
     * @param {string} sPayload - The source code syntax or JSON payload.
     * @param {HTML} oHtmlControl - The UI5 HTML wrapper control.
     * @param {(msg: string) => void} fnOnError - Error callback.
     * @returns {Promise<void>}
     */
    public static async renderDiagram(sEngine: string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void): Promise<void> {
        
        await ConfigManager.initialize();

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
                case "CYTOSCAPE": // <-- NEW: Route the JSON payload to the Cytoscape canvas builder
                    CytoscapeEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                default:
                    fnOnError(`Unsupported rendering engine: ${sEngine}`);
            }
        });
    }

    /**
     * @public
     * @description Façade method for exporting diagrams to PNG.
     * @param {SVGSVGElement} oSvg - The live SVG DOM element.
     * @returns {Promise<Blob>} A promise resolving to the PNG Blob.
     */
    public static convertSvgToPng(oSvg: SVGSVGElement): Promise<Blob> {
        return ExportUtility.convertSvgToPng(oSvg);
    }

    /**
     * @public
     * @description Façade method for raw vector exporting to secure the ViewBox prior to download.
     * @param {SVGSVGElement} oClone - A detached clone of the target SVG.
     * @param {SVGSVGElement} oOriginalSvg - The live DOM SVG to read computed styles from.
     * @returns {void}
     */
    public static hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
        ExportUtility.hardenSvgForDownload(oClone, oOriginalSvg);
    }
}