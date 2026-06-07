import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class PastelTheme
 * @description Enterprise definition for PastelTheme.
 */
export default class PastelTheme extends BaseTheme {
    public id = "pastel";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            bg: '#ffffff',
            border: '#e0e0e0',
            text: '#111111',
            focalBg: '#e8f5e9', // Mint green
            focalText: '#1b5e20',
            focalBorder: '#81c784',
            focalUnderlayColor: '#c8e6c9',
            edgeTextBg: '#ffffff',
            edgeText: '#424242',
            selectionHighlight: '#81c784',
            selectionUnderlay: '#e8f5e9',
            pinnedHighlight: '#e57373',
            focalScale: 1.15
        };
    }
}
