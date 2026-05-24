/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Unified interface for all diagram rendering engines.
 */
export interface IEngineFacade {
    supportsMinimap: boolean;
    supportsSearch: boolean;
    render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void, oConfig?: any): void | Promise<void>;
    exportSvg?(sPayload: string): string | Promise<string>;
    exportPng?(): string;
    toggleMinimap?(bShow: boolean): void;
    search?(sQuery: string): void;
}