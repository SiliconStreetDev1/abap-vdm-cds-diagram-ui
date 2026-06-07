import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class PrintFriendlyTheme
 * @description Enterprise definition for PrintFriendlyTheme.
 */
export default class PrintFriendlyTheme extends BaseTheme {
    public id = "print_friendly";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            bg: '#ffffff',
            border: '#000000',
            text: '#000000',
            focalBg: '#000000',
            focalText: '#ffffff',
            edgeTextBg: '#ffffff',
            edgeText: '#000000',
            selectionHighlight: '#000000',
            selectionUnderlay: '#e0e0e0',
            pinnedHighlight: '#333333'
        };
    }
}
