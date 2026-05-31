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
    presetPositions?: Record<string, {x: number, y: number, isPinned?: boolean, isHidden?: boolean}>;
}

export interface IEngineFacade {
    supportsMinimap: boolean;
    supportsSearch: boolean;
    
    /**
     * @public
     * @description Standardized method to retrieve the maximum allowable payload size (in KB) this engine can safely render.
     */
    getMaxPayloadSize(): number;

    render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void, oConfig?: ICytoscapeConfig): void | Promise<void>;
    exportSvg?(sPayload: string): string | Promise<string>;
    exportPng?(): string;
    toggleMinimap?(bShow: boolean): void;
    search?(sQuery: string): void;
    updateFormat?(oFormat: ICytoscapeConfig): void;
    getCanvasState?(): Record<string, {x: number, y: number, isPinned?: boolean, isHidden?: boolean}>;
    setNodesLocked?(bLocked: boolean): void;
    runLayout?(): void;
    showHiddenNodes?(): void;
    setInteractionMode?(sMode: "pan" | "select"): void;
    clearSelection?(): void;

    /**
     * @public
     * @description Safely destroys the engine instance and cleans up memory.
     */
    destroy?(): void;
}