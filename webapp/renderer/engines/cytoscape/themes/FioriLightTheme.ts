import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class FioriLightTheme
 * @description Enterprise definition for FioriLightTheme.
 */
export default class FioriLightTheme extends BaseTheme {
    public id = "fiori_light";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            ...this.getDefaultHighlights(),
            bg: '#ffffff',
            border: '#89919a',
            text: '#32363a',
            focalBg: '#e05915',
            focalText: '#ffffff',
            edgeTextBg: '#ffffff',
            edgeText: '#32363a'
        };
    }
}
