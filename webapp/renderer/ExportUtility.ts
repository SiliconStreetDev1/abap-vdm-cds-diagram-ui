/**
 * @fileoverview Export and serialization utilities for SVGs.
 * @description Provides methods to harden SVGs for standalone downloading and to 
 * safely rasterize complex vector graphics into PNG blobs.
 */

export default class ExportUtility {

    /**
     * @public
     * @description Safely serializes an SVG to a PNG Blob with dynamic canvas downscaling.
     * @param {SVGSVGElement} oSvg - The live SVG DOM element to be converted.
     * @returns {Promise<Blob>} A promise resolving to the generated PNG Blob.
     */
    public static convertSvgToPng(oSvg: SVGSVGElement): Promise<Blob> {
        return new Promise((resolve, reject) => {
            let sSvgData = new XMLSerializer().serializeToString(oSvg);

            sSvgData = sSvgData.replace(/@import url\([^)]+\);?/gi, "");
            sSvgData = sSvgData.replace(/<image[^>]+href="http[^>]+>/gi, "");

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) return reject(new Error("Failed to acquire Canvas 2D context."));

            const img = new Image();

            const sWidthAttr = oSvg.getAttribute("width");
            const sHeightAttr = oSvg.getAttribute("height");
            const width = parseFloat(sWidthAttr !== null ? sWidthAttr : "3000");
            const height = parseFloat(sHeightAttr !== null ? sHeightAttr : "3000");

            let scale = 2;
            const MAX_DIMENSION = 16000;
            const MAX_AREA = 100000000;

            while ((width * scale > MAX_DIMENSION || height * scale > MAX_DIMENSION || (width * scale * height * scale) > MAX_AREA) && scale > 0.5) {
                scale -= 0.5;
            }

            canvas.width = width * scale;
            canvas.height = height * scale;
            ctx.scale(scale, scale);

            const sBase64 = ExportUtility._utf8ToBase64(sSvgData);
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
     * @public
     * @description Prepares an SVG for raw standalone download by inlining computed CSS.
     * @param {SVGSVGElement} oClone - A detached clone of the target SVG.
     * @param {SVGSVGElement} oOriginalSvg - The live DOM SVG utilized to compute current styles.
     * @returns {void}
     */
    public static hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
        const aOriginal = oOriginalSvg.querySelectorAll<SVGGraphicsElement>("path, polygon, ellipse, text, circle, rect");
        const aClone = oClone.querySelectorAll<SVGGraphicsElement>("path, polygon, ellipse, text, circle, rect");

        aOriginal.forEach((el, i) => {
            const style = window.getComputedStyle(el);
            const oCloneEl = aClone[i];

            if (oCloneEl && oCloneEl.style) {
                oCloneEl.style.fill = style.fill;
                oCloneEl.style.stroke = style.stroke;
                oCloneEl.style.strokeWidth = style.strokeWidth;
                oCloneEl.style.fontSize = style.fontSize;
                oCloneEl.style.fontFamily = style.fontFamily;
            }
        });

        // CRITICAL FIX: Purge the inline 100% CSS that Graphviz/D3 injects
        oClone.style.removeProperty("width");
        oClone.style.removeProperty("height");

        // 1. GRAPHVIZ FIX: Use the native ViewBox if it exists
        const sViewBox = oOriginalSvg.getAttribute("viewBox");
        if (sViewBox) {
            const aViewBoxParts = sViewBox.trim().split(/\s+|,/);
            if (aViewBoxParts.length >= 4) {
                const width = parseFloat(aViewBoxParts[2]);
                const height = parseFloat(aViewBoxParts[3]);

                oClone.setAttribute("width", `${width}px`);
                oClone.setAttribute("height", `${height}px`);
                oClone.removeAttribute("preserveAspectRatio");

                oClone.style.display = "block";
                oClone.style.margin = "0 auto";
                oClone.style.backgroundColor = "white";
                
                return; // Exit early to preserve Graphviz internal transforms
            }
        }

        // 2. FALLBACK FOR PLANTUML & MERMAID: Calculate bounds manually
        const oContentGroup = oOriginalSvg.querySelector<SVGGElement>("g");
        if (oContentGroup) {
            try {
                const oBBox = oContentGroup.getBBox();
                const iPad = 20;

                const finalWidth = oBBox.width + (iPad * 2);
                const finalHeight = oBBox.height + (iPad * 2);

                oClone.setAttribute("viewBox", `${oBBox.x - iPad} ${oBBox.y - iPad} ${finalWidth} ${finalHeight}`);
                oClone.setAttribute("width", `${finalWidth}px`);
                oClone.setAttribute("height", `${finalHeight}px`);
                oClone.removeAttribute("preserveAspectRatio");

                oClone.style.display = "block";
                oClone.style.margin = "0 auto";
                oClone.style.backgroundColor = "white";

            } catch (e) {
                oClone.setAttribute("width", "3000px");
                oClone.setAttribute("height", "3000px");
                oClone.style.display = "block";
                oClone.style.margin = "0 auto";
            }
        }

        const oCloneRootGroup = oClone.querySelector<SVGGElement>("g");
        if (oCloneRootGroup) oCloneRootGroup.removeAttribute("transform");
    }
    /**
     * @private
     * @description Safely converts a UTF-8 string to Base64 without using the deprecated `unescape`.
     * @param {string} str - The raw SVG string payload.
     * @returns {string} The Base64 encoded string.
     */
    private static _utf8ToBase64(str: string): string {
        const bytes = new TextEncoder().encode(str);
        const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
        return btoa(binString);
    }
}