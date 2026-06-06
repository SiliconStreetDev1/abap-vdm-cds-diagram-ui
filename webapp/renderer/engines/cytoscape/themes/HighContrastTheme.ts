import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

export default class HighContrastTheme extends BaseTheme {
    public id = "high_contrast";

    public getColors(): IThemeColors {
        return {
            bg: '#000000',
            border: '#ffffff',
            text: '#ffffff',
            focalBg: '#ffff00',
            focalText: '#000000',
            edgeTextBg: '#000000',
            edgeText: '#ffff00',
            selectionHighlight: '#ffff00',
            selectionUnderlay: '#ffffff',
            pinnedHighlight: '#ff0000'
        };
    }
}
