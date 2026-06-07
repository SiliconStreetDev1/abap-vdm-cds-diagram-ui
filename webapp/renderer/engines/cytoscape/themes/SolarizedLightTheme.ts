import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class SolarizedLightTheme
 * @description Enterprise definition for SolarizedLightTheme.
 */
export default class SolarizedLightTheme extends BaseTheme {
    public id = "solarized_light";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            bg: '#fdf6e3',
            border: '#93a1a1',
            text: '#073642',
            focalBg: '#cb4b16',
            focalText: '#fdf6e3',
            edgeTextBg: '#fdf6e3',
            edgeText: '#073642',
            selectionHighlight: '#268bd2',
            selectionUnderlay: '#268bd2',
            pinnedHighlight: '#dc322f',
            focalScale: 1.25,
            focalUnderlayColor: '#b58900'
        };
    }
}
