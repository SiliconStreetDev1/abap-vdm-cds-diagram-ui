import { ITheme, IThemeColors } from "./ITheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @description Abstract base class providing common fallbacks for themes.
 */
export abstract class BaseTheme implements ITheme {
    public abstract id: string;
    
    /**
     * @abstract
     * @description Must be implemented by concrete classes to provide the theme palette.
     */
    public abstract getColors(): IThemeColors;

    /**
     * @protected
     * @description Returns standard Fiori-based highlight defaults if not overridden by the concrete class.
     */
    protected getDefaultHighlights(): Partial<IThemeColors> {
        return {
            selectionHighlight: '#0854a0',
            selectionUnderlay: '#0854a0',
            pinnedHighlight: '#d32f2f'
        };
    }
}
