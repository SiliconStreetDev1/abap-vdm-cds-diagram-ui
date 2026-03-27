/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview PlantUML rendering implementation.
 * @description Interfaces with PlantUML Server APIs using deflation and 6-bit Base64 encoding.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";
import DomManager from "../DomManager";

declare const pako: any;

export default class PlantUmlEngine {
    
    /**
     * @public
     * @static
     * @description Renders the payload via server and injects it into the Fiori View.
     * @param {string} sPayload - Syntax payload.
     * @param {string} sRenderId - UI Element ID.
     * @param {Function} fnOnError - Error handler.
     * @returns {void}
     */
    public static render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        const config = ConfigManager.get();

        NetworkManager.loadScript(config.localPaths?.pako, config.cdnPaths?.pako).then(() => {
            try {
                const utf8Bytes = new TextEncoder().encode(sPayload);
                const deflated = pako.deflateRaw(utf8Bytes, { level: 9 });
                const encoded = this._encode64(deflated);

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
    public static async exportSvg(sPayload: string): Promise<string> {
        const config = ConfigManager.get();
        await NetworkManager.loadScript(config.localPaths?.pako, config.cdnPaths?.pako);

        const utf8Bytes = new TextEncoder().encode(sPayload);
        const deflated = pako.deflateRaw(utf8Bytes, { level: 9 });
        const encoded = this._encode64(deflated);

        if (config.maxUrlLength && encoded.length > config.maxUrlLength) {
            throw new Error("Payload exceeds PlantUML server limits.");
        }

        const response = await fetch(`${config.plantUmlServerUrl}${encoded}`);
        if (!response.ok) throw new Error(`HTTP ${response.status} from PlantUML Server`);
        
        return await response.text();
    }

    private static _encode64(data: Uint8Array): string {
        let r = "";
        for (let i = 0; i < data.length; i += 3) {
            if (i + 2 === data.length) r += this._enc3(data[i], data[i + 1], 0);
            else if (i + 1 === data.length) r += this._enc3(data[i], 0, 0);
            else r += this._enc3(data[i], data[i + 1], data[i + 2]);
        }
        return r;
    }

    private static _enc3(b1: number, b2: number, b3: number): string {
        const c1 = b1 >> 2;
        const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
        const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
        const c4 = b3 & 0x3F;
        return this._enc1(c1 & 0x3F) + this._enc1(c2 & 0x3F) + this._enc1(c3 & 0x3F) + this._enc1(c4 & 0x3F);
    }

    private static _enc1(b: number): string {
        if (b < 10) return String.fromCharCode(48 + b); b -= 10;
        if (b < 26) return String.fromCharCode(65 + b); b -= 26;
        if (b < 26) return String.fromCharCode(97 + b); b -= 26;
        if (b === 0) return '-'; if (b === 1) return '_'; return '?';
    }
}