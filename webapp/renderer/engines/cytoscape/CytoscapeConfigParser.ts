/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Configuration parser for Cytoscape.js rendering.
 * @description Normalizes raw format configurations from the backend/UI into a strict, typed `ICyConfig` object.
 */

export interface IParsedCytoscapeConfig {
    layout: string;
    rankDir: string;
    theme: string;
    lineStyle: string;
    animate: boolean;
    autoScale: boolean;
    nodeSpacing: number;
    snapGuides: boolean;
    isDrillDown: boolean;
    isViewerMode?: boolean;
    isRestore?: boolean;
    presetPositions: Record<string, any> | null;
}

export default class CytoscapeConfigParser {

    /**
     * @public
     * @static
     * @description Parses and normalizes format properties into a standardized config object.
     * @param {any} format - Raw formatting options from the backend or UI state.
     * @returns {IParsedCytoscapeConfig} The sanitized and strongly-typed configuration.
     */
    public static parse(format: any): IParsedCytoscapeConfig {
        return {
            layout: format.layout_algorithm || format.layoutAlgorithm || 'dagre',
            rankDir: format.rank_dir || format.rankDir || 'TB',
            theme: format.theme || 'fiori_light',
            lineStyle: format.line_style || format.lineStyle || 'bezier',
            animate: format.animate !== false,
            autoScale: format.autoScale !== false,
            nodeSpacing: parseInt(format.node_spacing || format.nodeSpacing || "200", 10),
            snapGuides: format.snapGuides === true,
            isDrillDown: format.isDrillDown === true,
            isViewerMode: format.isViewerMode === true,
            isRestore: format.isRestore === true,
            presetPositions: format.presetPositions || null
        };
    }
}