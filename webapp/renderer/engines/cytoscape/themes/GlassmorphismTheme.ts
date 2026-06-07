import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class GlassmorphismTheme
 * @description Enterprise definition for GlassmorphismTheme.
 */
export default class GlassmorphismTheme extends BaseTheme {
    public id = "glassmorphism";

    /**
     * @public
     * @description Executes getColors functionality.
     */
    public getColors(): IThemeColors {
        return {
            bg: '#1c1c1c', // Fallback, usually overridden by full UI gradient
            border: '#ffffff',
            text: '#ffffff',
            nodeOpacity: 0.25, // Frosted glass child nodes
            focalBg: '#ffffff', // Solid bright focal node
            focalText: '#000000',
            focalOpacity: 1.0, // Fully opaque focal node so it stands out
            focalBorder: '#ffffff',
            focalUnderlayColor: '#ffffff',
            edgeTextBg: '#1c1c1c',
            edgeText: '#ffffff',
            selectionHighlight: '#00e5ff',
            selectionUnderlay: '#00e5ff',
            pinnedHighlight: '#ff1744',
            focalScale: 1.15
        };
    }
}
