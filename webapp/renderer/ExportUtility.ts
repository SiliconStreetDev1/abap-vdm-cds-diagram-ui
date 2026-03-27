/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer
 * @fileoverview Export formatting and serialization utilities.
 * @description Safely rasterizes complex vector strings into PNG blobs. 
 * Includes dynamic memory management for massive enterprise diagram exports.
 */
export default class ExportUtility {

    /**
     * @public
     * @static
     * @description Safely serializes a standardized SVG string to a PNG Blob with dynamic canvas downscaling.
     * Scrubs external resources to prevent Canvas Tainting (SecurityError).
     * @param {string} sSvgData - The pure, standardized SVG string.
     * @returns {Promise<Blob>} A promise resolving to the generated PNG Blob.
     */
    public static convertSvgStringToPng(sSvgData: string): Promise<Blob> {
        return new Promise((resolve, reject) => {
            // Scrub external dependencies to prevent Canvas CORS lock
            let sCleanSvgData = sSvgData.replace(/@import url\([^)]+\);?/gi, "");
            sCleanSvgData = sCleanSvgData.replace(/<image[^>]+href="http[^>]+>/gi, "");

            const parser = new DOMParser();
            const doc = parser.parseFromString(sCleanSvgData, "image/svg+xml");
            const oSvg = doc.documentElement as unknown as SVGSVGElement;

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Failed to acquire Canvas 2D context."));

            const img = new Image();

            // Extract intrinsic dimensions from the viewBox since attributes are 100%
            let width = 3000;
            let height = 3000;
            const viewBox = oSvg.getAttribute("viewBox");
            if (viewBox) {
                const parts = viewBox.split(" ");
                if (parts.length === 4) {
                    width = parseFloat(parts[2]);
                    height = parseFloat(parts[3]);
                }
            }

            // Memory Safeguard (Governor)
            let scale = 2;
            const MAX_DIMENSION = 16000;
            const MAX_AREA = 100000000;

            while ((width * scale > MAX_DIMENSION || height * scale > MAX_DIMENSION || (width * scale * height * scale) > MAX_AREA) && scale > 0.5) {
                scale -= 0.5;
            }

            canvas.width = width * scale;
            canvas.height = height * scale;
            ctx.scale(scale, scale);

            // Encode and draw to Canvas
            const sBase64 = ExportUtility._utf8ToBase64(sCleanSvgData);
            img.src = "data:image/svg+xml;base64," + sBase64;

            img.onload = () => {
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0);

                try {
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error("Image too massive for pixel rendering. Use SVG Download instead."));
                    }, "image/png");
                } catch (e: any) {
                    reject(new Error(`Canvas Export Error: ${e.message}`));
                }
            };

            img.onerror = () => reject(new Error("Failed to parse sanitized SVG Data URI."));
        });
    }

    /**
     * @private
     * @static
     * @description Safely converts a UTF-8 string to Base64.
     * @param {string} str - The raw SVG string payload.
     * @returns {string} The Base64 encoded string.
     */
    private static _utf8ToBase64(str: string): string {
        const bytes = new TextEncoder().encode(str);
        const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
        return btoa(binString);
    }
}