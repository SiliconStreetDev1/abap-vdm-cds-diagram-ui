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
import ConfigManager from "./ConfigManager";
import { EngineType } from "../types";
import { IEngineFacade } from "./engines/IEngineFacade";
import EngineRegistry from "./EngineRegistry";

// Register default engines statically when Renderer is imported to ensure they are available
EngineRegistry.registerEngine(EngineType.MERMAID, MermaidEngine);
EngineRegistry.registerEngine(EngineType.GRAPHVIZ, GraphvizEngine);
EngineRegistry.registerEngine(EngineType.PLANTUML, PlantUmlEngine);
EngineRegistry.registerEngine(EngineType.CYTOSCAPE, CytoscapeEngine);
EngineRegistry.registerEngine("D2", D2Engine);

export default class Renderer {
    /**
     * @public
     * @static
     * @description Single source of truth for the default rendering engine.
     */
    public static getDefaultEngine(): string {
        return EngineType.CYTOSCAPE;
    }

    private static _getEngine(engineId: string): IEngineFacade | null {
        return EngineRegistry.getEngine(engineId);
    }

    /**
     * @public
     * @static
     * @description Renders the diagram visually into the active Fiori UI5 DOM.
     * @param {EngineType | string} engineId - Target Engine
     * @param {string} payload - Syntax payload
     * @param {HTML} htmlControl - UI5 Control target
     * @param {Function} onError - Error handler
     * @param {any} [config] - Engine-specific configuration
     * @returns {Promise<void>}
     */
    public static async renderDiagram(viewId: string, engineId: EngineType | string, payload: string, htmlControl: HTML, onError: (msg: string) => void, config?: Record<string, any>): Promise<void> {
        await ConfigManager.initialize();

        const engine = this._getEngine(engineId);
        if (!engine) {
            onError(`Unsupported rendering engine: ${engineId}`);
            return;
        }

        // Clean up previous engine instances to prevent memory leaks and duplicate UI artifacts
        if (viewId) {
            EngineRegistry.getAllEngines().forEach(eng => {
                if (eng !== engine && eng.destroy) eng.destroy(viewId);
            });
        }

        // Enforce engine-specific rendering limits to prevent browser thread crashes.
        const iMaxSizeKb = engine.getMaxPayloadSize();
        const iMaxChars = iMaxSizeKb * 1024;

        if (payload.length > iMaxChars) {
            const iActualKb = Math.round(payload.length / 1024);
            onError(`Diagram too large to render (${iActualKb} KB). Please use "Download Source".`);
            return;
        }

        DomManager.setupCanvas(htmlControl, onError, (renderId: string) => {
            engine.render(viewId, payload, renderId, onError, config);
        });
    }

    /**
     * @public
     * @static
     * @description Generates a pure, headless SVG string completely independently 
     * of the active UI5 view. Ensures the UI5 Pan/Zoom controls are never interrupted.
     * @param {EngineType} engineId - The requested export engine.
     * @param {string} payload - The source syntax or JSON payload.
     * @returns {Promise<string>} A promise resolving to the finalized, standard XML/SVG string.
     */
    public static async generateRawExportSvg(viewId: string, engineId: EngineType | string, payload: string): Promise<string> {
        await ConfigManager.initialize();
        
        const engine = this._getEngine(engineId);
        if (!engine || !engine.exportSvg) {
            throw new Error(`Unsupported export engine or SVG export not supported: ${engineId}`);
        }

        return await engine.exportSvg(payload, viewId);
    }

    /**
     * @public
     * @static
     * @description Toggles the minimap display
     */
    public static toggleMinimap(viewId: string, engineId: string, show: boolean): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.toggleMinimap) {
            engine.toggleMinimap(viewId, show);
        }
    }

    /**
     * @public
     * @static
     * @description Issues a search command to the active rendering engine.
     * @param {string} engineId - Target Engine
     * @param {string} query - Search string
     */
    public static searchCanvas(viewId: string, engineId: string, query: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.search) {
            engine.search(viewId, query);
        }
    }

    /**
     * @public
     * @static
     * @description Updates the visual format of the current diagram dynamically without a complete DOM re-render.
     * @param {EngineType | string} engineId - Target Engine
     * @param {any} format - Config Payload
     * @returns {void}
     */
    public static updateLiveFormat(viewId: string, engineId: EngineType | string, format: Record<string, any>): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.updateFormat) {
            engine.updateFormat(viewId, format);
        }
    }

    /**
     * @public
     * @static
     * @description Exposes gamification and effect plugins specific to this engine.
     */
    public static getAvailableEffects(engineId: string): { id: string; name: string; enabled: boolean }[] {
        const engine = this._getEngine(engineId);
        if (engine && engine.getAvailableEffects) {
            return engine.getAvailableEffects();
        }
        return [];
    }

    /**
     * @public
     * @static
     * @description Enables or disables a specific effect plugin at runtime.
     */
    public static toggleEffect(engineId: string, effectId: string, enabled: boolean): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.toggleEffect) {
            engine.toggleEffect(effectId, enabled);
        }
    }

    /**
     * @public
     * @static
     * @description Delegates configuration formatting to the specific engine to uphold the Open-Closed Principle.
     */
    public static formatBackendConfig(engineId: EngineType | string, rawConfig: Record<string, any>): Record<string, any> {
        const engine = this._getEngine(engineId);
        if (engine && engine.formatBackendConfig) {
            return engine.formatBackendConfig(rawConfig);
        }
        return Object.assign({}, rawConfig); // Default fallback: clone and return raw
    }

    public static getEngineDefaults(): Record<string, any> {
        const oDefaults: Record<string, any> = {};
        EngineRegistry.getAllEngines().forEach(engine => {
            if (engine.configPath && engine.getDefaultConfig) {
                const sKey = engine.configPath.replace("/", "");
                oDefaults[sKey] = engine.getDefaultConfig();
            }
        });
        return oDefaults;
    }

    public static resetFormatConfigs(uiModel: any): void {
        EngineRegistry.getAllEngines().forEach(engine => {
            if (engine.configPath && engine.getDefaultConfig) {
                uiModel.setProperty(engine.configPath, engine.getDefaultConfig());
            }
        });
    }

    public static supportsLiveUpdate(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsLiveUpdate : false;
    }

    public static supportsStateCapture(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsStateCapture : false;
    }

    public static applyStateToConfig(engineId: string, config: Record<string, any>, state: any): Record<string, any> {
        const engine = this._getEngine(engineId);
        return engine && engine.applyStateToConfig ? engine.applyStateToConfig(config, state) : config;
    }

    public static extractStateForVariant(engineId: string, config: Record<string, any>, canvasState: any, savePositions: boolean): Record<string, any> {
        const engine = this._getEngine(engineId);
        return engine && engine.extractStateForVariant ? engine.extractStateForVariant(config, canvasState, savePositions) : config;
    }

    public static supportsMinimap(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsMinimap : false;
    }

    public static supportsSearch(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsSearch : false;
    }

    public static isAsynchronousRenderer(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.isAsynchronousRenderer : false;
    }

    public static supportsInteractiveMode(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsInteractiveMode : false;
    }

    public static supportsAdvancedFormatting(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsAdvancedFormatting : false;
    }

    public static supportsSourceExport(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsSourceExport : false;
    }

    public static supportsImageExport(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.supportsImageExport : false;
    }

    public static supportsNativePngExport(engineId: string): boolean {
        const engine = this._getEngine(engineId);
        return engine ? !!engine.exportPng : false;
    }

    public static exportPng(viewId: string, engineId: string): string {
        const engine = this._getEngine(engineId);
        return engine && engine.exportPng ? engine.exportPng(viewId) : "";
    }

    /**
     * @public
     * @static
     * @description Extracts the live X/Y canvas coordinates for layout persistence.
     */
    public static moveNode(viewId: string, engineId: string, nodeId: string, position: {x: number, y: number}): void { const engine = this._getEngine(engineId); if (engine && engine.moveNode) engine.moveNode(viewId, nodeId, position); }

    /**
     * @public
     * @static
     * @description Translates multiple nodes iteratively in a single batched O(1) engine command.
     */
    public static moveNodes(viewId: string, engineId: string, nodes: { nodeId: string; position: {x: number, y: number} }[]): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.moveNodes) engine.moveNodes(viewId, nodes);
    }

    /**
     * @public
     * @static
     * @description Extracts the live X/Y canvas coordinates for layout persistence.
     */
    public static getCanvasState(viewId: string, engineId: string): Record<string, any> | null {
        const engine = this._getEngine(engineId);
        return engine && engine.getCanvasState ? engine.getCanvasState(viewId) : null;
    }

    /**
     * @public
     * @static
     * @description Instructs the engine to lock or unlock the physical positions of all nodes.
     */
    public static setNodesLocked(viewId: string, engineId: string, isLocked: boolean): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.setNodesLocked) {
            engine.setNodesLocked(viewId, isLocked);
        }
    }

    /**
     * @public
     * @static
     * @description Forces the engine to rerun its layout algorithm.
     */
    public static runLayout(viewId: string, engineId: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.runLayout) {
            engine.runLayout(viewId);
        }
    }

    /**
     * @public
     * @static
     * @description Instructs the engine to restore visibility to all hidden nodes.
     */
    public static showHiddenNodes(viewId: string, engineId: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.showHiddenNodes) {
            engine.showHiddenNodes(viewId);
        }
    }

    /**
     * @public
     * @static
     * @description Selectively restores specifically identified nodes to the canvas.
     * @param {string} engineId - Target Engine
     * @param {string[]} nodeIds - Array of internal node IDs to restore.
     */
    public static showSpecificNodes(viewId: string, engineId: string, nodeIds: string[]): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.showSpecificNodes) {
            engine.showSpecificNodes(viewId, nodeIds);
        }
    }

    /**
     * @public
     * @static
     * @description Alters the canvas interaction mode (e.g., standard panning vs marquee box selection).
     * @param {string} engineId - Target Engine
     * @param {"pan" | "select"} mode - The desired interaction mode.
     */
    public static setInteractionMode(viewId: string, engineId: string, mode: "pan" | "select"): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.setInteractionMode) {
            engine.setInteractionMode(viewId, mode);
        }
    }

    /**
     * @public
     * @static
     * @description Clears all active selections from the canvas.
     */
    public static clearSelection(viewId: string, engineId: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.clearSelection) {
            engine.clearSelection(viewId);
        }
    }

    /**
     * @public
     * @static
     * @description Selects all visible nodes on the canvas.
     */
    public static selectAll(viewId: string, engineId: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.selectAll) {
            engine.selectAll(viewId);
        }
    }

    /**
     * @public
     * @static
     * @description Deletes selected notes and hides selected entities.
     */
    public static deleteSelection(viewId: string, engineId: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.deleteSelection) { engine.deleteSelection(viewId); }
    }

    public static deleteSpecificElements(viewId: string, engineId: string, notesJson: any, hiddenNodeIds: string[]): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.deleteSpecificElements) { engine.deleteSpecificElements(viewId, notesJson, hiddenNodeIds); }
    }

    public static restoreSelection(viewId: string, engineId: string, notesJson: any, hiddenNodeIds: string[]): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.restoreSelection) { engine.restoreSelection(viewId, notesJson, hiddenNodeIds); }
    }

    /**
     * @public
     * @static
     * @description Engages a temporary neighborhood focus mode on the current selection.
     */
    public static setTempFocusMode(viewId: string, engineId: string, enable: boolean): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.setTempFocusMode) {
            engine.setTempFocusMode(viewId, enable);
        }
    }

    /**
     * @public
     * @static
     * @description Add a new sticky note to the active graph.
     */
    public static addNote(viewId: string, engineId: string, text: string, fontFamily: string): any {
        const engine = this._getEngine(engineId);
        if (engine && engine.addNote) {
            return engine.addNote(viewId, text, fontFamily);
        }
        return null;
    }

    /**
     * @public
     * @static
     * @description Edit an existing sticky note on the active graph.
     */
    public static editNote(viewId: string, engineId: string, noteId: string, text: string, fontFamily?: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.editNote) {
            engine.editNote(viewId, noteId, text, fontFamily);
        }
    }

    /**
     * @public
     * @static
     * @description Change the color of an existing sticky note.
     */
    public static changeNoteColor(viewId: string, engineId: string, noteId: string, bgColor: string, borderColor: string): void {
        const engine = this._getEngine(engineId);
        if (engine && engine.changeNoteColor) {
            engine.changeNoteColor(viewId, noteId, bgColor, borderColor);
        }
    }

    /**
     * @public
     * @static
     * @description Safely destroys the active engine to prevent memory and event listener leaks on app exit.
     */
    public static destroyActiveEngine(viewId: string): void {
        if (viewId) {
            EngineRegistry.getAllEngines().forEach(engine => {
                if (engine.destroy) engine.destroy(viewId);
            });
        }
    }
}