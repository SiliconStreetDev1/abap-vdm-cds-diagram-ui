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
import { IEngineFacade, ICytoscapeConfig } from "./engines/IEngineFacade";

export default class Renderer {

    private static _activeEngine: IEngineFacade | null = null;

    private static _getEngine(sEngine: string): IEngineFacade | null {
        const sNormalizedEngine = String(sEngine).toUpperCase();
        switch (sNormalizedEngine) {
            case String(EngineType.MERMAID).toUpperCase(): return MermaidEngine;
            case String(EngineType.GRAPHVIZ).toUpperCase(): return GraphvizEngine;
            case String(EngineType.PLANTUML).toUpperCase(): return PlantUmlEngine;
            case String(EngineType.CYTOSCAPE).toUpperCase(): return CytoscapeEngine;
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
    public static async renderDiagram(sEngine: EngineType | string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void, oConfig?: ICytoscapeConfig): Promise<void> {
        await ConfigManager.initialize();

        const engine = this._getEngine(sEngine);
        if (!engine) {
            fnOnError(`Unsupported rendering engine: ${sEngine}`);
            return;
        }

        // Clean up previous engine instances to prevent memory leaks and duplicate UI artifacts
        if (this._activeEngine && this._activeEngine !== engine && this._activeEngine.destroy) {
            this._activeEngine.destroy();
        }
        this._activeEngine = engine;

        // Enforce engine-specific rendering limits to prevent browser thread crashes.
        const iMaxSizeKb = engine.getMaxPayloadSize();
        const iMaxChars = iMaxSizeKb * 1024;

        if (sPayload.length > iMaxChars) {
            const iActualKb = Math.round(sPayload.length / 1024);
            fnOnError(`Diagram too large to render (${iActualKb} KB). Please use "Download Source".`);
            return;
        }

        DomManager.setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            engine.render(sPayload, sRenderId, fnOnError, oConfig);
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
    public static updateLiveFormat(sEngine: EngineType | string, oFormat: ICytoscapeConfig): void {
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

    /**
     * @public
     * @static
     * @description Extracts the live X/Y canvas coordinates for layout persistence.
     */
    public static getCanvasState(sEngine: string): Record<string, {x: number, y: number, isPinned?: boolean, isHidden?: boolean}> | null {
        const engine = this._getEngine(sEngine);
        return engine && engine.getCanvasState ? engine.getCanvasState() : null;
    }

    /**
     * @public
     * @static
     * @description Instructs the engine to lock or unlock the physical positions of all nodes.
     */
    public static setNodesLocked(sEngine: string, bLocked: boolean): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.setNodesLocked) {
            engine.setNodesLocked(bLocked);
        }
    }

    /**
     * @public
     * @static
     * @description Forces the engine to rerun its layout algorithm.
     */
    public static runLayout(sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.runLayout) {
            engine.runLayout();
        }
    }

    /**
     * @public
     * @static
     * @description Instructs the engine to restore visibility to all hidden nodes.
     */
    public static showHiddenNodes(sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.showHiddenNodes) {
            engine.showHiddenNodes();
        }
    }

    /**
     * @public
     * @static
     * @description Alters the canvas interaction mode (e.g., standard panning vs marquee box selection).
     * @param {string} sEngine - Target Engine
     * @param {"pan" | "select"} sMode - The desired interaction mode.
     */
    public static setInteractionMode(sEngine: string, sMode: "pan" | "select"): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.setInteractionMode) {
            engine.setInteractionMode(sMode);
        }
    }

    /**
     * @public
     * @static
     * @description Clears all active selections from the canvas.
     */
    public static clearSelection(sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.clearSelection) {
            engine.clearSelection();
        }
    }

    /**
     * @public
     * @static
     * @description Safely destroys the active engine to prevent memory and event listener leaks on app exit.
     */
    public static destroyActiveEngine(): void {
        if (this._activeEngine && this._activeEngine.destroy) {
            this._activeEngine.destroy();
        }
        this._activeEngine = null;
    }
}