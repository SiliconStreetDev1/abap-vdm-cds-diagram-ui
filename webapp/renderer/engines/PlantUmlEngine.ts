/**
 * @fileoverview PlantUML rendering implementation via public server generation.
 * @description Handles the proprietary 6-bit Base64 encoding required by the PlantUML server.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";
import DomManager from "../DomManager";

declare const pako: any;

export default class PlantUmlEngine {
    
    /**
     * @public
     * @description Deflates, encodes, and transmits the payload to the PlantUML server.
     * @param {string} sPayload - The raw PlantUML syntax.
     * @param {string} sRenderId - The target DOM container ID.
     * @param {(msg: string) => void} fnOnError - Error callback.
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
     * @description Strips all XML comments from the SVG response.
     * @param {string} svgText - The raw SVG text from the server.
     * @param {string} sRenderId - The target DOM container ID.
     * @returns {void}
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
     * @private
     * @description Maps standard Base64 to PlantUML's proprietary custom 6-bit URL-safe alphabet.
     * @param {Uint8Array} data - The deflated byte array.
     * @returns {string} The encoded string.
     */
    private static _encode64(data: Uint8Array): string {
        let r = "";
        for (let i = 0; i < data.length; i += 3) {
            if (i + 2 === data.length) r += this._enc3(data[i], data[i + 1], 0);
            else if (i + 1 === data.length) r += this._enc3(data[i], 0, 0);
            else r += this._enc3(data[i], data[i + 1], data[i + 2]);
        }
        return r;
    }

    /**
     * @private
     * @description Converts 3 bytes into 4 PlantUML characters.
     * @param {number} b1 - First byte.
     * @param {number} b2 - Second byte.
     * @param {number} b3 - Third byte.
     * @returns {string} 4-character mapped string.
     */
    private static _enc3(b1: number, b2: number, b3: number): string {
        const c1 = b1 >> 2;
        const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
        const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
        const c4 = b3 & 0x3F;
        return this._enc1(c1 & 0x3F) + this._enc1(c2 & 0x3F) + this._enc1(c3 & 0x3F) + this._enc1(c4 & 0x3F);
    }

    /**
     * @private
     * @description Maps a 6-bit integer to the PlantUML alphabet.
     * @param {number} b - 6-bit integer.
     * @returns {string} Single mapped character.
     */
    private static _enc1(b: number): string {
        if (b < 10) return String.fromCharCode(48 + b); b -= 10;
        if (b < 26) return String.fromCharCode(65 + b); b -= 26;
        if (b < 26) return String.fromCharCode(97 + b); b -= 26;
        if (b === 0) return '-'; if (b === 1) return '_'; return '?';
    }
}