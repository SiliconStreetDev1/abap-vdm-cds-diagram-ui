/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview PlantUML rendering implementation.
 * @description Interfaces with PlantUML Server APIs using deflation and 6-bit Base64 encoding.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";
import DomManager from "../DomManager";
import PlantUmlEncoder from "./PlantUmlEncoder";

declare const pako: any;

export default class PlantUmlEngine {
    
    public static configPath = "/formatPlantUML";
    public static supportsMinimap = false;
    public static supportsSearch = false;
    public static supportsSourceExport = true;
    public static supportsImageExport = true;

    /**
     * @public
     * @returns {number} The maximum supported payload size in KB.
     * @description PlantUML requests pass via URL strings, requiring a stricter limit.
     */
    public static getMaxPayloadSize(): number {
        return 50;
    }

    /**
     * @public
     * @static
     * @description Provides the baseline default configuration for the UI Model.
     */
    public static getDefaultConfig(): Record<string, any> {
        return { lineStyle: "default", spaced_out: false, staggered: false, modern: true };
    }

    /**
     * @public
     * @static
     * @description Formats the raw UI configuration for the backend payload.
     */
    public static formatBackendConfig(oRawConfig: Record<string, any>): Record<string, any> {
        const oFormatConfig = Object.assign({}, oRawConfig);
        oFormatConfig.ortho = (oFormatConfig.lineStyle === "ortho");
        oFormatConfig.polyline = (oFormatConfig.lineStyle === "polyline");
        delete oFormatConfig.lineStyle;
        return oFormatConfig;
    }

    /**
     * @public
     * @description Clean up method for PlantUML.
     */
    public static destroy(sViewId: string): void {
        // Headless engine relying on standard DOM injections. Handled by DomManager.
    }

    /**
     * @public
     * @static
     * @description Renders the payload via server and injects it into the Fiori View.
     * @param {string} sPayload - Syntax payload.
     * @param {string} sRenderId - UI Element ID.
     * @param {Function} fnOnError - Error handler.
     * @returns {void}
     */
    public static render(sViewId: string, sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        const config = ConfigManager.get();

        NetworkManager.loadScript(config.localPaths?.pako, config.cdnPaths?.pako).then(() => {
            try {
                const utf8Bytes = new TextEncoder().encode(sPayload);
                const deflated = pako.deflateRaw(utf8Bytes, { level: 9 });
                const encoded = PlantUmlEncoder.encode(deflated);

                if (config.maxUrlLength && encoded.length > config.maxUrlLength) {
                    fnOnError("Payload exceeds PlantUML server limits. Please switch to Mermaid or Graphviz.");
                    return;
                }

                fetch(`${config.plantUmlServerUrl}${encoded}`)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.text();
                    })
                    .then(svgText => this._processPlantUmlSvg(svgText, sRenderId))
                    .catch(err => fnOnError(`PlantUML Network Error: ${err.message}`));

            } catch (e: any) {
                fnOnError(`PlantUML Encoding Error: ${e.message}`);
            }
        });
    }

    /**
     * @private
     * @static
     * @description Processes and attaches Zoom behavior for the active screen.
     */
    private static _processPlantUmlSvg(svgText: string, sRenderId: string): void {
        const sCommentStart = "<" + "!--";
        const sCommentEnd = "--" + ">";
        const rxComments = new RegExp(sCommentStart + "[\\s\\S]*?" + sCommentEnd, "g");

        const cleanSvg = svgText.replace(rxComments, "");

        const oTarget = document.getElementById(sRenderId);
        if (oTarget) {
            oTarget.innerHTML = cleanSvg;
            DomManager.attachStandardZoom(sRenderId);
        }
    }

    /**
     * @public
     * @static
     * @description Headless execution context to retrieve the raw PlantUML payload specifically for export.
     * Fetches directly from the network and returns the raw string, bypassing the DOM entirely.
     * @param {string} sPayload - The PlantUML syntax string.
     * @returns {Promise<string>} A promise resolving to the raw SVG network response text.
     */
    public static async exportSvg(sPayload: string, sViewId?: string): Promise<string> {
        const config = ConfigManager.get();
        await NetworkManager.loadScript(config.localPaths?.pako, config.cdnPaths?.pako);

        const utf8Bytes = new TextEncoder().encode(sPayload);
        const deflated = pako.deflateRaw(utf8Bytes, { level: 9 });
        const encoded = PlantUmlEncoder.encode(deflated);

        if (config.maxUrlLength && encoded.length > config.maxUrlLength) {
            throw new Error("Payload exceeds PlantUML server limits.");
        }

        const response = await fetch(`${config.plantUmlServerUrl}${encoded}`);
        if (!response.ok) throw new Error(`HTTP ${response.status} from PlantUML Server`);
        
        return await response.text();
    }
}