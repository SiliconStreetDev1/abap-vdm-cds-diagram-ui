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

    private static _getEngine(sEngine: string): any {
        switch (sEngine) {
            case EngineType.MERMAID: return MermaidEngine;
            case EngineType.GRAPHVIZ: return GraphvizEngine;
            case EngineType.PLANTUML: return PlantUmlEngine;
            case EngineType.CYTOSCAPE: return CytoscapeEngine;
            default: return null;
        }
    }

    /**
     * @public
     * @static
     * @description Renders the diagram visually into the active Fiori UI5 DOM.
     * @param {EngineType | string} sEngine - Target Engine
     * @param {string} sPayload - Syntax payload
     * @param {HTML} oHtmlControl - UI5 Control target
     * @param {Function} fnOnError - Error handler
     * @param {any} [oConfig] - Engine-specific configuration
     * @returns {Promise<void>}
     */
    public static async renderDiagram(sEngine: EngineType | string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void, oConfig?: any): Promise<void> {
        await ConfigManager.initialize();

        DomManager.setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            const engine = this._getEngine(sEngine);
            if (engine) {
                engine.render(sPayload, sRenderId, fnOnError, oConfig);
            } else {
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
    public static async generateExportSvg(sEngine: EngineType | string, sPayload: string): Promise<string> {
        await ConfigManager.initialize();
        
        const engine = this._getEngine(sEngine);
        if (!engine || !engine.exportSvg) {
            throw new Error(`Unsupported export engine or SVG export not supported: ${sEngine}`);
        }

        const sRawSvg = await engine.exportSvg(sPayload);

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
    public static toggleMinimap(sEngine: string, bShow: boolean): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.toggleMinimap) {
            engine.toggleMinimap(bShow);
        }
    }

    /**
     * @public
     * @static
     * @description Issues a search command to the active rendering engine.
     * @param {string} sEngine - Target Engine
     * @param {string} sQuery - Search string
     */
    public static searchCanvas(sEngine: string, sQuery: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.search) {
            engine.search(sQuery);
        }
    }

    /**
     * @public
     * @static
     * @description Updates the visual format of the current diagram dynamically without a complete DOM re-render.
     * @param {EngineType | string} sEngine - Target Engine
     * @param {any} oFormat - Config Payload
     * @returns {void}
     */
    public static updateLiveFormat(sEngine: EngineType | string, oFormat: any): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.updateFormat) {
            engine.updateFormat(oFormat);
        }
    }

    public static supportsMinimap(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsMinimap : false;
    }

    public static supportsSearch(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsSearch : false;
    }

    public static supportsNativePngExport(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.exportPng : false;
    }

    public static exportPng(sEngine: string): string {
        const engine = this._getEngine(sEngine);
        return engine && engine.exportPng ? engine.exportPng() : "";
    }
}