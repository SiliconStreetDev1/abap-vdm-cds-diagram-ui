import { ITheme } from "./ITheme";
import FioriLightTheme from "./FioriLightTheme";
import FioriDarkTheme from "./FioriDarkTheme";
import HighContrastTheme from "./HighContrastTheme";
import BlueprintTheme from "./BlueprintTheme";
import PrintFriendlyTheme from "./PrintFriendlyTheme";
import SolarizedLightTheme from "./SolarizedLightTheme";
import SolarizedDarkTheme from "./SolarizedDarkTheme";
import PastelTheme from "./PastelTheme";
import NeonInvertedTheme from "./NeonInvertedTheme";
import GlassmorphismTheme from "./GlassmorphismTheme";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytoscape.themes
 * @class ThemeRegistry
 * @description Enterprise definition for ThemeRegistry.
 */
export default class ThemeRegistry {
    private static _themes: Map<string, ITheme> = new Map();

    static {
        // Pre-register standard Fiori and specialized themes
        ThemeRegistry.register(new FioriLightTheme());
        ThemeRegistry.register(new FioriDarkTheme());
        ThemeRegistry.register(new HighContrastTheme());
        ThemeRegistry.register(new BlueprintTheme());
        ThemeRegistry.register(new PrintFriendlyTheme());
        ThemeRegistry.register(new SolarizedLightTheme());
        ThemeRegistry.register(new SolarizedDarkTheme());
        ThemeRegistry.register(new PastelTheme());
        ThemeRegistry.register(new NeonInvertedTheme());
        ThemeRegistry.register(new GlassmorphismTheme());
    }

    public static register(theme: ITheme): void {
        ThemeRegistry._themes.set(theme.id, theme);
    }

    public static getTheme(id: string): ITheme {
        return ThemeRegistry._themes.get(id) || ThemeRegistry._themes.get("fiori_light") as ITheme;
    }
}
