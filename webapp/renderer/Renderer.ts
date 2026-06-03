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
import D2Engine from "./engines/D2Engine";
import ExportUtility from "./ExportUtility";
import ConfigManager from "./ConfigManager";
import SvgProcessor from "../helpers/SvgProcessor";
import { EngineType } from "../types";
import { IEngineFacade } from "./engines/IEngineFacade";

export default class Renderer {
    private static _aEngines: IEngineFacade[] = [MermaidEngine, GraphvizEngine, PlantUmlEngine, CytoscapeEngine, D2Engine];

    private static _getEngine(sEngine: string): IEngineFacade | null {
        const sNormalizedEngine = String(sEngine).toUpperCase();
        switch (sNormalizedEngine) {
            case String(EngineType.MERMAID).toUpperCase(): return MermaidEngine;
            case String(EngineType.GRAPHVIZ).toUpperCase(): return GraphvizEngine;
            case String(EngineType.PLANTUML).toUpperCase(): return PlantUmlEngine;
            case String(EngineType.CYTOSCAPE).toUpperCase(): return CytoscapeEngine;
            case "D2": return D2Engine;
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
    public static async renderDiagram(sViewId: string, sEngine: EngineType | string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void, oConfig?: Record<string, any>): Promise<void> {
        await ConfigManager.initialize();

        const engine = this._getEngine(sEngine);
        if (!engine) {
            fnOnError(`Unsupported rendering engine: ${sEngine}`);
            return;
        }

        // Clean up previous engine instances to prevent memory leaks and duplicate UI artifacts
        if (sViewId) {
            this._aEngines.forEach(eng => {
                if (eng !== engine && eng.destroy) eng.destroy(sViewId);
            });
        }

        // Enforce engine-specific rendering limits to prevent browser thread crashes.
        const iMaxSizeKb = engine.getMaxPayloadSize();
        const iMaxChars = iMaxSizeKb * 1024;

        if (sPayload.length > iMaxChars) {
            const iActualKb = Math.round(sPayload.length / 1024);
            fnOnError(`Diagram too large to render (${iActualKb} KB). Please use "Download Source".`);
            return;
        }

        DomManager.setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            engine.render(sViewId, sPayload, sRenderId, fnOnError, oConfig);
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
    public static async generateExportSvg(sViewId: string, sEngine: EngineType | string, sPayload: string): Promise<string> {
        await ConfigManager.initialize();
        
        const engine = this._getEngine(sEngine);
        if (!engine || !engine.exportSvg) {
            throw new Error(`Unsupported export engine or SVG export not supported: ${sEngine}`);
        }

        const sRawSvg = await engine.exportSvg(sPayload, sViewId);

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
    public static toggleMinimap(sViewId: string, sEngine: string, bShow: boolean): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.toggleMinimap) {
            engine.toggleMinimap(sViewId, bShow);
        }
    }

    /**
     * @public
     * @static
     * @description Issues a search command to the active rendering engine.
     * @param {string} sEngine - Target Engine
     * @param {string} sQuery - Search string
     */
    public static searchCanvas(sViewId: string, sEngine: string, sQuery: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.search) {
            engine.search(sViewId, sQuery);
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
    public static updateLiveFormat(sViewId: string, sEngine: EngineType | string, oFormat: Record<string, any>): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.updateFormat) {
            engine.updateFormat(sViewId, oFormat);
        }
    }

    /**
     * @public
     * @static
     * @description Delegates configuration formatting to the specific engine to uphold the Open-Closed Principle.
     */
    public static formatBackendConfig(sEngine: EngineType | string, oRawConfig: Record<string, any>): Record<string, any> {
        const engine = this._getEngine(sEngine);
        if (engine && engine.formatBackendConfig) {
            return engine.formatBackendConfig(oRawConfig);
        }
        return Object.assign({}, oRawConfig); // Default fallback: clone and return raw
    }

    public static getEngineDefaults(): Record<string, any> {
        const oDefaults: Record<string, any> = {};
        this._aEngines.forEach(engine => {
            if (engine.configPath && engine.getDefaultConfig) {
                const sKey = engine.configPath.replace("/", "");
                oDefaults[sKey] = engine.getDefaultConfig();
            }
        });
        return oDefaults;
    }

    public static resetFormatConfigs(oUiModel: any): void {
        this._aEngines.forEach(engine => {
            if (engine.configPath && engine.getDefaultConfig) {
                oUiModel.setProperty(engine.configPath, engine.getDefaultConfig());
            }
        });
    }

    public static supportsLiveUpdate(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsLiveUpdate : false;
    }

    public static supportsStateCapture(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsStateCapture : false;
    }

    public static applyStateToConfig(sEngine: string, oConfig: Record<string, any>, oState: any): Record<string, any> {
        const engine = this._getEngine(sEngine);
        return engine && engine.applyStateToConfig ? engine.applyStateToConfig(oConfig, oState) : oConfig;
    }

    public static extractStateForVariant(sEngine: string, oConfig: Record<string, any>, oCanvasState: any, bSavePositions: boolean): Record<string, any> {
        const engine = this._getEngine(sEngine);
        return engine && engine.extractStateForVariant ? engine.extractStateForVariant(oConfig, oCanvasState, bSavePositions) : oConfig;
    }

    public static supportsMinimap(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsMinimap : false;
    }

    public static supportsSearch(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsSearch : false;
    }

    public static supportsSourceExport(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsSourceExport : false;
    }

    public static supportsImageExport(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.supportsImageExport : false;
    }

    public static supportsNativePngExport(sEngine: string): boolean {
        const engine = this._getEngine(sEngine);
        return engine ? !!engine.exportPng : false;
    }

    public static exportPng(sViewId: string, sEngine: string): string {
        const engine = this._getEngine(sEngine);
        return engine && engine.exportPng ? engine.exportPng(sViewId) : "";
    }

    /**
     * @public
     * @static
     * @description Extracts the live X/Y canvas coordinates for layout persistence.
     */
    public static getCanvasState(sViewId: string, sEngine: string): Record<string, any> | null {
        const engine = this._getEngine(sEngine);
        return engine && engine.getCanvasState ? engine.getCanvasState(sViewId) : null;
    }

    /**
     * @public
     * @static
     * @description Instructs the engine to lock or unlock the physical positions of all nodes.
     */
    public static setNodesLocked(sViewId: string, sEngine: string, bLocked: boolean): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.setNodesLocked) {
            engine.setNodesLocked(sViewId, bLocked);
        }
    }

    /**
     * @public
     * @static
     * @description Forces the engine to rerun its layout algorithm.
     */
    public static runLayout(sViewId: string, sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.runLayout) {
            engine.runLayout(sViewId);
        }
    }

    /**
     * @public
     * @static
     * @description Instructs the engine to restore visibility to all hidden nodes.
     */
    public static showHiddenNodes(sViewId: string, sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.showHiddenNodes) {
            engine.showHiddenNodes(sViewId);
        }
    }

    /**
     * @public
     * @static
     * @description Selectively restores specifically identified nodes to the canvas.
     * @param {string} sEngine - Target Engine
     * @param {string[]} aNodeIds - Array of internal node IDs to restore.
     */
    public static showSpecificNodes(sViewId: string, sEngine: string, aNodeIds: string[]): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.showSpecificNodes) {
            engine.showSpecificNodes(sViewId, aNodeIds);
        }
    }

    /**
     * @public
     * @static
     * @description Alters the canvas interaction mode (e.g., standard panning vs marquee box selection).
     * @param {string} sEngine - Target Engine
     * @param {"pan" | "select"} sMode - The desired interaction mode.
     */
    public static setInteractionMode(sViewId: string, sEngine: string, sMode: "pan" | "select"): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.setInteractionMode) {
            engine.setInteractionMode(sViewId, sMode);
        }
    }

    /**
     * @public
     * @static
     * @description Clears all active selections from the canvas.
     */
    public static clearSelection(sViewId: string, sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.clearSelection) {
            engine.clearSelection(sViewId);
        }
    }

    /**
     * @public
     * @static
     * @description Selects all visible nodes on the canvas.
     */
    public static selectAll(sViewId: string, sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.selectAll) {
            engine.selectAll(sViewId);
        }
    }

    /**
     * @public
     * @static
     * @description Deletes selected notes and hides selected entities.
     */
    public static deleteSelection(sViewId: string, sEngine: string): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.deleteSelection) {
            engine.deleteSelection(sViewId);
        }
    }

    /**
     * @public
     * @static
     * @description Engages a temporary neighborhood focus mode on the current selection.
     */
    public static setTempFocusMode(sViewId: string, sEngine: string, bEnable: boolean): void {
        const engine = this._getEngine(sEngine);
        if (engine && engine.setTempFocusMode) {
            engine.setTempFocusMode(sViewId, bEnable);
        }
    }

    /**
     * @public
     * @static
     * @description Safely destroys the active engine to prevent memory and event listener leaks on app exit.
     */
    public static destroyActiveEngine(sViewId: string): void {
        if (sViewId) {
            this._aEngines.forEach(engine => {
                if (engine.destroy) engine.destroy(sViewId);
            });
        }
    }
}