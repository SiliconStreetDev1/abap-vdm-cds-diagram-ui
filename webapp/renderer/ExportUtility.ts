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
/**
 * @public
 * @description Prepares an SVG for raw standalone download utilizing isolated staging.
 * @param {SVGSVGElement} oClone - A detached clone of the target SVG.
 * @param {SVGSVGElement} oOriginalSvg - The live DOM SVG utilized to compute current styles.
 * @returns {void}
 */
public static hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
        const NS = "http://www.w3.org/2000/svg";

        // 1) Inline critical visual styles
        const aOriginal = oOriginalSvg.querySelectorAll<SVGGraphicsElement>("path, polygon, ellipse, text, circle, rect");
        const aClone = oClone.querySelectorAll<SVGGraphicsElement>("path, polygon, ellipse, text, circle, rect");

        aOriginal.forEach((el, i) => {
            const style = window.getComputedStyle(el);
            const oCloneEl = aClone[i];

            if (oCloneEl && oCloneEl.style) {
                const tag = el.tagName.toLowerCase();
                if (tag === "path") {
                    oCloneEl.style.fill = "none";
                } else {
                    oCloneEl.style.fill = style.fill;
                }
                oCloneEl.style.stroke = style.stroke;
                oCloneEl.style.strokeWidth = style.strokeWidth;
                oCloneEl.style.fontSize = style.fontSize;
                oCloneEl.style.fontFamily = style.fontFamily;
            }
        });

        // 2) Purge inline CSS
        oClone.style.removeProperty("width");
        oClone.style.removeProperty("height");
const ensureContentGroup = (root: SVGSVGElement): SVGGElement => {
    const existing = root.querySelector<SVGGElement>("g.graph") || root.querySelector<SVGGElement>("g");
    
    // FIXED: Using parentNode satisfies TypeScript's type constraints
    if (existing && existing.parentNode === root) return existing; 
    
    const wrapper = document.createElementNS(NS, "g");
    while (root.firstChild) wrapper.appendChild(root.firstChild);
    root.appendChild(wrapper);
    return wrapper as SVGGElement;
};
        const pad = 10; 

        // 3) ViewBox Translation
        const sViewBox = oOriginalSvg.getAttribute("viewBox");
        if (sViewBox) {
            const parts = sViewBox.trim().split(/\s+|,/).filter(p => p.length);
            if (parts.length >= 4) {
                const origX = parseFloat(parts[0]) || 0;
                const origY = parseFloat(parts[1]) || 0;
                const origW = parseFloat(parts[2]) || 0;
                const origH = parseFloat(parts[3]) || 0;

                let measuredMinX = origX;
                let measuredMinY = origY;
                try {
                    const oOriginalGroup = oOriginalSvg.querySelector<SVGGElement>("g.graph") || oOriginalSvg.querySelector<SVGGElement>("g");
                    if (oOriginalGroup) {
                        const saved = oOriginalGroup.getAttribute("transform");
                        if (saved) oOriginalGroup.removeAttribute("transform");
                        const bbox = oOriginalGroup.getBBox();
                        if (!Number.isNaN(bbox.x) && !Number.isNaN(bbox.y)) {
                            measuredMinX = Math.min(measuredMinX, bbox.x);
                            measuredMinY = Math.min(measuredMinY, bbox.y);
                        }
                        if (saved) oOriginalGroup.setAttribute("transform", saved);
                    }
                } catch {
                    // Ignore measurement errors
                }

                const newW = Math.max(1, Math.ceil(origW + pad * 2));
                const newH = Math.max(1, Math.ceil(origH + pad * 2));

                oClone.setAttribute("viewBox", `0 0 ${newW} ${newH}`);
                oClone.setAttribute("preserveAspectRatio", "xMidYMid meet");

                const contentGroup = ensureContentGroup(oClone);
                contentGroup.removeAttribute("transform");
                contentGroup.style.transform = "";

                const tx = -measuredMinX + pad;
                const ty = -measuredMinY + pad;
                contentGroup.setAttribute("transform", `translate(${tx} ${ty})`);

                oClone.setAttribute("width", `${newW}px`);
                oClone.setAttribute("height", `${newH}px`);

                oClone.style.display = "block";
                oClone.style.margin = "0 auto";
                oClone.style.backgroundColor = "white";

                const rootGroup = oClone.querySelector<SVGGElement>("g.graph") || oClone.querySelector<SVGGElement>("g");
                const bg = rootGroup ? rootGroup.querySelector<SVGPolygonElement>(":scope > polygon") : null;
                if (bg) bg.remove();

                return; // Safely exit the method if this block succeeds
            }
        } // <--- NOTICE: Only the 'if' statements close here. No extra '}' closing the method.

        // 4) FALLBACK (Now properly inside the method)
        const oContentGroup = oOriginalSvg.querySelector<SVGGElement>("g");
        if (oContentGroup) {
            try {
                const savedTransform = oContentGroup.getAttribute("transform");
                if (savedTransform) oContentGroup.removeAttribute("transform");

                const oBBox = oContentGroup.getBBox();
                const minX = oBBox.x;
                const minY = oBBox.y;
                const finalW = Math.max(1, Math.ceil(oBBox.width + pad * 2));
                const finalH = Math.max(1, Math.ceil(oBBox.height + pad * 2));

                oClone.setAttribute("viewBox", `0 0 ${finalW} ${finalH}`);
                oClone.setAttribute("preserveAspectRatio", "xMidYMid meet");

                const contentGroup = ensureContentGroup(oClone);
                contentGroup.removeAttribute("transform");
                contentGroup.style.transform = "";
                
                const tx = -minX + pad;
                const ty = -minY + pad;
                contentGroup.setAttribute("transform", `translate(${tx} ${ty})`);

                oClone.setAttribute("width", `${finalW}px`);
                oClone.setAttribute("height", `${finalH}px`);

                oClone.style.display = "block";
                oClone.style.margin = "0 auto";
                oClone.style.backgroundColor = "white";

                const oCloneRootGroup = oClone.querySelector<SVGGElement>("g.graph") || oClone.querySelector<SVGGElement>("g");
                const bg = oCloneRootGroup ? oCloneRootGroup.querySelector<SVGPolygonElement>(":scope > polygon") : null;
                if (bg) bg.remove();

                if (savedTransform) oContentGroup.setAttribute("transform", savedTransform);

            } catch (e) {
                oClone.setAttribute("width", "3000px");
                oClone.setAttribute("height", "3000px");
                oClone.style.display = "block";
                oClone.style.margin = "0 auto";
                oClone.style.backgroundColor = "white";
            }
        }

        // 5) Final cleanup
        const oCloneRootGroup2 = oClone.querySelector<SVGGElement>("g.graph") || oClone.querySelector<SVGGElement>("g");
        if (oCloneRootGroup2) {
            const t = oCloneRootGroup2.getAttribute("transform") || "";
            if (t && !t.trim().startsWith("translate(")) {
                oCloneRootGroup2.removeAttribute("transform");
                oCloneRootGroup2.style.transform = "";
            }
        }
    } // <--- THIS is the actual end of the hardenSvgForDownload method.


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