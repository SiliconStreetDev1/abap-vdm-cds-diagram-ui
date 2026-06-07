import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class NeonInvertedTheme
 * @description Enterprise definition for NeonInvertedTheme.
 */
export default class NeonInvertedTheme extends BaseTheme {
    public id = "neon_inverted";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            bg: '#121212',
            border: '#333333',
            text: '#e0e0e0',
            focalBg: '#121212', // Hollow focal node
            focalText: '#00e5ff', // Cyan text
            focalBorder: '#00e5ff', // Cyan neon border
            focalUnderlayColor: '#00e5ff',
            edgeTextBg: '#121212',
            edgeText: '#00e5ff',
            selectionHighlight: '#b388ff',
            selectionUnderlay: '#b388ff',
            pinnedHighlight: '#ff1744',
            focalScale: 1.25
        };
    }
}
