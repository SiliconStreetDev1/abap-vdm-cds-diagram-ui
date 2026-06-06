import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

export default class PrintFriendlyTheme extends BaseTheme {
    public id = "print_friendly";

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
