/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer
 * @fileoverview VDM / CDS Diagram Engine Renderer (Façade)
 * @description Serves as the primary public API. Orchestrates asynchronous 
 * configuration loading, rendering routes, and isolated export generation.
 */

import HTML from "sap/ui/core/HTML";
import DomManager from "./DomManager";
import MermaidEngine from "./engines/MermaidEngine";
import GraphvizEngine from "./engines/GraphvizEngine";
import PlantUmlEngine from "./engines/PlantUmlEngine";
import CytoscapeEngine from "./engines/CytoscapeEngine";
import ExportUtility from "./ExportUtility";
import ConfigManager from "./ConfigManager";
import SvgProcessor from "../helpers/SvgProcessor";
import { EngineType } from "../types";

export default class Renderer {

    /**
     * @public
     * @static
     * @description Renders the diagram visually into the active Fiori UI5 DOM.
     * @param {EngineType} sEngine - Target Engine
     * @param {string} sPayload - Syntax payload
     * @param {HTML} oHtmlControl - UI5 Control target
     * @param {Function} fnOnError - Error handler
     * @returns {Promise<void>}
     */
    public static async renderDiagram(sEngine: EngineType, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void): Promise<void> {
        await ConfigManager.initialize();

        DomManager.setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            switch (sEngine) {
                case EngineType.MERMAID:
                    MermaidEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                case EngineType.GRAPHVIZ:
                    GraphvizEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                case EngineType.PLANTUML:
                    PlantUmlEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                case EngineType.CYTOSCAPE:
                    CytoscapeEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                default:
                    fnOnError(`Unsupported rendering engine: ${sEngine}`);
            }
        });
    }

    /**
     * @public
     * @static
     * @description Generates a pure, headless SVG string completely independently 
     * of the active UI5 view. Ensures the UI5 Pan/Zoom controls are never interrupted.
     * @param {EngineType} sEngine - The requested export engine.
     * @param {string} sPayload - The source syntax or JSON payload.
     * @returns {Promise<string>} A promise resolving to the finalized, standard XML/SVG string.
     */
    public static async generateExportSvg(sEngine: EngineType, sPayload: string): Promise<string> {
        await ConfigManager.initialize();
        
        let sRawSvg = "";

        switch (sEngine) {
            case EngineType.CYTOSCAPE:
                sRawSvg = CytoscapeEngine.exportSvg();
                break;
            case EngineType.MERMAID:
                sRawSvg = await MermaidEngine.exportSvg(sPayload);
                break;
            case EngineType.PLANTUML:
                sRawSvg = await PlantUmlEngine.exportSvg(sPayload);
                break;
            case EngineType.GRAPHVIZ:
                sRawSvg = await GraphvizEngine.exportSvg(sPayload);
                break;
            default:
                throw new Error(`Unsupported export engine: ${sEngine}`);
        }

        // Pipe the raw engine output through the enterprise XML standardizer
        return SvgProcessor.standardize(sRawSvg);
    }

    /**
     * @public
     * @static
     * @description Converts a standard SVG string to a PNG Blob.
     * @param {string} sSvgData - The formatted SVG string.
     * @returns {Promise<Blob>}
     */
    public static convertSvgStringToPng(sSvgData: string): Promise<Blob> {
        return ExportUtility.convertSvgStringToPng(sSvgData);
    }

    /**
     * @public
     * @static
     * @description Toggles the minimap display
     */
    public static toggleMinimap(bShow: boolean): void {
        CytoscapeEngine.toggleMinimap(bShow);
    }

    /**
     * @public
     * @static
     * @description Issues a search command to the active rendering engine.
     * @param {string} sEngine - Target Engine
     * @param {string} sQuery - Search string
     */
    public static searchCanvas(sEngine: string, sQuery: string): void {
        if (sEngine === "CYTOSCAPE") {
            CytoscapeEngine.search(sQuery);
        }
    }
}