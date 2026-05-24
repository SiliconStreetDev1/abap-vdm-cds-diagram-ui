/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Exporter utility for Cytoscape.js canvas.
 * @description Provides methods to export the active Cytoscape graph into PNG or standard SVG formats.
 */
export default class CytoscapeExporter {

    /**
     * @public
     * @static
     * @description Exports the current canvas view as a base64 encoded PNG string.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @returns {string} Base64 PNG data URI.
     */
    public static exportPng(cyInstance: any): string {
        if (!cyInstance) return "";
        return cyInstance.png({ bg: '#ffffff', full: true, scale: 2 });
    }

    /**
     * @public
     * @static
     * @description Exports the current canvas view as a zoomable, centered SVG string.
     * Applies internal CSS for centering while retaining physical dimensions to enable browser scroll-to-zoom.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @returns {string} Formatted SVG XML string.
     */
    public static exportSvg(cyInstance: any): string {
        if (!cyInstance || typeof cyInstance.svg !== "function") return "";
        
        let sRawSvg = cyInstance.svg({ scale: 1, full: true, bg: '#ffffff' });

        try {
            const oParser = new DOMParser();
            const oDoc = oParser.parseFromString(sRawSvg, "image/svg+xml");
            const oSvgElement = oDoc.documentElement;

            const sWidth = oSvgElement.getAttribute("width");
            const sHeight = oSvgElement.getAttribute("height");

            if (!oSvgElement.hasAttribute("viewBox") && sWidth && sHeight) {
                const iWidth = parseFloat(sWidth.replace(/px|pt|em/g, ""));
                const iHeight = parseFloat(sHeight.replace(/px|pt|em/g, ""));
                
                if (!isNaN(iWidth) && !isNaN(iHeight)) {
                    oSvgElement.setAttribute("viewBox", `0 0 ${iWidth} ${iHeight}`);
                }
            }

            oSvgElement.setAttribute("style", "margin: 0 auto; display: block; background: #ffffff;");
            if (sWidth) oSvgElement.setAttribute("width", sWidth);
            if (sHeight) oSvgElement.setAttribute("height", sHeight);
            oSvgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

            sRawSvg = new XMLSerializer().serializeToString(oDoc);
        } catch (e: any) {
            console.warn("Could not apply responsive centering to SVG string.", e);
        }

        return sRawSvg;
    }
}