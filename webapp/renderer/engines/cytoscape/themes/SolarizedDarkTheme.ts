import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class SolarizedDarkTheme
 * @description Enterprise definition for SolarizedDarkTheme.
 */
export default class SolarizedDarkTheme extends BaseTheme {
    public id = "solarized_dark";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            bg: '#002b36',
            border: '#586e75',
            text: '#fdf6e3',
            focalBg: '#cb4b16',
            focalText: '#fdf6e3',
            edgeTextBg: '#002b36',
            edgeText: '#fdf6e3',
            selectionHighlight: '#268bd2',
            selectionUnderlay: '#268bd2',
            pinnedHighlight: '#dc322f',
            focalScale: 1.25,
            focalUnderlayColor: '#b58900'
        };
    }
}
