/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Unified interface for all diagram rendering engines.
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
     * @description Standardized method to retrieve the maximum allowable payload size (in KB) this engine can safely render.
     */
    getMaxPayloadSize(): number;

    /**
     * @public
     * @description Formats and sanitizes the raw UI configuration into the backend-expected structure.
     */
    formatBackendConfig?(oRawConfig: Record<string, any>): Record<string, any>;

    /**
     * @public
     * @description Provides the baseline default configuration for the UI Model.
     */
    getDefaultConfig?(): Record<string, any>;

    /**
     * @public
     * @description State hydration and extraction overrides for Variant and Undo persistence.
     */
    applyStateToConfig?(oConfig: Record<string, any>, oState: any): Record<string, any>;
    extractStateForVariant?(oConfig: Record<string, any>, oCanvasState: any, bSavePositions: boolean): Record<string, any>;

    render(sViewId: string, sPayload: string, sRenderId: string, fnOnError: (msg: string) => void, oConfig?: Record<string, any>): void | Promise<void>;
    exportSvg?(sPayload: string, sViewId?: string): string | Promise<string>;
    exportPng?(sViewId: string): string;
    toggleMinimap?(sViewId: string, bShow: boolean): void;
    search?(sViewId: string, sQuery: string): void;
    updateFormat?(sViewId: string, oFormat: Record<string, any>): void;
    getCanvasState?(sViewId: string): any;
    moveNode?(sViewId: string, nodeId: string, position: {x: number, y: number}): void;
    moveNodes?(sViewId: string, nodes: { nodeId: string; position: {x: number, y: number} }[]): void;
    setNodesLocked?(sViewId: string, bLocked: boolean): void;
    runLayout?(sViewId: string): void;
    showHiddenNodes?(sViewId: string): void;
    showSpecificNodes?(sViewId: string, aNodeIds: string[]): void;
    setInteractionMode?(sViewId: string, sMode: "pan" | "select"): void;
    setTempFocusMode?(sViewId: string, bEnable: boolean): void;
    clearSelection?(sViewId: string): void;
    selectAll?(sViewId: string): void;
    deleteSelection?(sViewId: string): void;
    deleteSpecificElements?(sViewId: string, notesJson: any, hiddenNodeIds: string[]): void;
    restoreSelection?(sViewId: string, notesJson: any, hiddenNodeIds: string[]): void;

    /**
     * @public
     * @description Annotation Management 
     */
    addNote?(sViewId: string, sText: string, sFontFamily: string): any;
    editNote?(sViewId: string, sNoteId: string, sText: string, sFontFamily?: string): void;
    changeNoteColor?(sViewId: string, sNoteId: string, sBgColor: string, sBorderColor: string): void;

    /**
     * @public
     * @description Safely destroys the engine instance and cleans up memory.
     */
    destroy?(sViewId: string): void;
}