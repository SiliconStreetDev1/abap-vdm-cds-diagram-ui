import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

export default class PastelTheme extends BaseTheme {
    public id = "pastel";

    public getColors(): IThemeColors {
        return {
            bg: '#ffffff',
            border: '#e0e0e0',
            text: '#111111',
            focalBg: '#e8f5e9', // Mint green
            focalText: '#1b5e20',
            focalBorder: '#81c784',
            focalUnderlayColor: '#c8e6c9',
            edgeTextBg: '#ffffff',
            edgeText: '#424242',
            selectionHighlight: '#81c784',
            selectionUnderlay: '#e8f5e9',
            pinnedHighlight: '#e57373',
            focalScale: 1.15
        };
    }
}
