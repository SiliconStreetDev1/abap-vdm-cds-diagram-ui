import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class FioriDarkTheme
 * @description Enterprise definition for FioriDarkTheme.
 */
export default class FioriDarkTheme extends BaseTheme {
    public id = "fiori_dark";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            ...this.getDefaultHighlights(),
            bg: '#29313a',
            border: '#6b7a89',
            text: '#fafafa',
            focalBg: '#d84a38',
            focalText: '#ffffff',
            edgeTextBg: '#29313a',
            edgeText: '#fafafa'
        };
    }
}
