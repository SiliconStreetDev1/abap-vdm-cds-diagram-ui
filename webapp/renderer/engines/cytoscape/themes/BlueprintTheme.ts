import { BaseTheme } from "./BaseTheme";
import { IThemeColors } from "./ITheme";

export default class BlueprintTheme extends BaseTheme {
    public id = "blueprint";

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
