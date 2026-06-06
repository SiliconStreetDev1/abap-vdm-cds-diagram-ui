import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

export default class FioriDarkTheme extends BaseTheme {
    public id = "fiori_dark";

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
