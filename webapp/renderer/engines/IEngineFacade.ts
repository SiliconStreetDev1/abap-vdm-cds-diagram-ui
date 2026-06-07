/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Unified interface for all diagram rendering engines.
 * @description Adheres to strict Enterprise Clean Code standards with pure typings and no Hungarian notation.
 */

export interface IEngineFacade {
    configPath?: string;
    supportsLiveUpdate?: boolean;
    supportsStateCapture?: boolean;
    
    supportsMinimap: boolean;
    supportsSearch: boolean;
    supportsSourceExport?: boolean;
    supportsImageExport?: boolean;
    
    isAsynchronousRenderer?: boolean;
    supportsInteractiveMode?: boolean;
    supportsAdvancedFormatting?: boolean;
    
    /**
     * @public
     * @description Exposes gamification and effect plugins specific to this engine.
     */
    getAvailableEffects?(): { id: string; name: string; enabled: boolean }[];
    toggleEffect?(effectId: string, isEnabled: boolean): void;

    /**
     * @public
     * @description Standardized method to retrieve the maximum allowable payload size (in KB) this engine can safely render.
     */
    getMaxPayloadSize(): number;

    /**
     * @public
     * @description Formats and sanitizes the raw UI configuration into the backend-expected structure.
     */
    formatBackendConfig?(rawConfig: Record<string, any>): Record<string, any>;

    /**
     * @public
     * @description Provides the baseline default configuration for the UI Model.
     */
    getDefaultConfig?(): Record<string, any>;

    /**
     * @public
     * @description State hydration and extraction overrides for Variant and Undo persistence.
     */
    applyStateToConfig?(config: Record<string, any>, state: any): Record<string, any>;
    extractStateForVariant?(config: Record<string, any>, canvasState: any, savePositions: boolean): Record<string, any>;

    render(viewId: string, payload: string, renderId: string, onError: (msg: string) => void, config?: Record<string, any>): void | Promise<void>;
    exportSvg?(payload: string, viewId?: string): string | Promise<string>;
    exportPng?(viewId: string): string;
    toggleMinimap?(viewId: string, show: boolean): void;
    search?(viewId: string, query: string): void;
    updateFormat?(viewId: string, format: Record<string, any>): void;
    getCanvasState?(viewId: string): any;
    moveNode?(viewId: string, nodeId: string, position: {x: number, y: number}): void;
    moveNodes?(viewId: string, nodes: { nodeId: string; position: {x: number, y: number} }[]): void;
    setNodesLocked?(viewId: string, isLocked: boolean): void;
    runLayout?(viewId: string): void;
    showHiddenNodes?(viewId: string): void;
    showSpecificNodes?(viewId: string, nodeIds: string[]): void;
    setInteractionMode?(viewId: string, mode: "pan" | "select"): void;
    setTempFocusMode?(viewId: string, enable: boolean): void;
    clearSelection?(viewId: string): void;
    selectAll?(viewId: string): void;
    deleteSelection?(viewId: string): void;
    deleteSpecificElements?(viewId: string, notesJson: any, hiddenNodeIds: string[]): void;
    restoreSelection?(viewId: string, notesJson: any, hiddenNodeIds: string[]): void;

    /**
     * @public
     * @description Annotation Management 
     */
    addNote?(viewId: string, text: string, fontFamily: string): any;
    editNote?(viewId: string, noteId: string, text: string, fontFamily?: string): void;
    changeNoteColor?(viewId: string, noteId: string, bgColor: string, borderColor: string): void;

    /**
     * @public
     * @description Safely destroys the engine instance and cleans up memory.
     */
    destroy?(viewId: string): void;
}