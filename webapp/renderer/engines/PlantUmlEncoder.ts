/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Custom 6-bit Base64 Encoder for PlantUML.
 * @description PlantUML uses a proprietary 6-bit encoding algorithm that differs from standard Base64.
 * Extracted to enforce the Single Responsibility Principle.
 */
export default class PlantUmlEncoder {
    public static encode(data: Uint8Array): string {
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