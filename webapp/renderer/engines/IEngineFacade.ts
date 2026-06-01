/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Unified interface for all diagram rendering engines.
 */

export interface ICytoscapeConfig {
    layout_algorithm?: string;
    rank_dir?: string;
    theme?: string;
    line_style?: string;
    node_spacing?: number;
    animate?: boolean;
    snapGuides?: boolean;
    isDrillDown?: boolean;
    presetPositions?: Record<string, any> | null;
    camera?: { zoom: number, pan: { x: number, y: number } };
}

export interface IEngineFacade {
    supportsMinimap: boolean;
    supportsSearch: boolean;
    
    /**
     * @public
     * @description Standardized method to retrieve the maximum allowable payload size (in KB) this engine can safely render.
     */
    getMaxPayloadSize(): number;

    render(sViewId: string, sPayload: string, sRenderId: string, fnOnError: (msg: string) => void, oConfig?: ICytoscapeConfig): void | Promise<void>;
    exportSvg?(sPayload: string, sViewId?: string): string | Promise<string>;
    exportPng?(sViewId: string): string;
    toggleMinimap?(sViewId: string, bShow: boolean): void;
    search?(sViewId: string, sQuery: string): void;
    updateFormat?(sViewId: string, oFormat: ICytoscapeConfig): void;
    getCanvasState?(sViewId: string): any;
    setNodesLocked?(sViewId: string, bLocked: boolean): void;
    runLayout?(sViewId: string): void;
    showHiddenNodes?(sViewId: string): void;
    showSpecificNodes?(sViewId: string, aNodeIds: string[]): void;
    setInteractionMode?(sViewId: string, sMode: "pan" | "select"): void;
    clearSelection?(sViewId: string): void;

    /**
     * @public
     * @description Safely destroys the engine instance and cleans up memory.
     */
    destroy?(sViewId: string): void;
}