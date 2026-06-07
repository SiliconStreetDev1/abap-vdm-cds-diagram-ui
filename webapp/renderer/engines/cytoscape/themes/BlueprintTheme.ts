import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class BlueprintTheme
 * @description Enterprise definition for BlueprintTheme.
 */
export default class BlueprintTheme extends BaseTheme {
    public id = "blueprint";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            bg: '#0a3a60',
            border: '#4da6ff',
            text: '#ffffff',
            focalBg: '#ff9900',
            focalText: '#ffffff',
            edgeTextBg: '#0a3a60',
            edgeText: '#4da6ff',
            selectionHighlight: '#4da6ff',
            selectionUnderlay: '#0a3a60',
            pinnedHighlight: '#ff9900'
        };
    }
}
