/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @description Interfaces for the plug-and-play Theme Architecture.
 */

export interface IThemeColors {
    bg: string;
    border: string;
    text: string;
    focalBg: string;
    focalText: string;
    edgeTextBg: string;
    edgeText: string;
    selectionHighlight?: string;
    selectionUnderlay?: string;
    pinnedHighlight?: string;
    focalShape?: string;
    focalScale?: number;
    focalUnderlayColor?: string;
    focalBorder?: string;
    nodeOpacity?: number;
    focalOpacity?: number;
}

export interface ITheme {
    id: string;
    getColors(): IThemeColors;
}
