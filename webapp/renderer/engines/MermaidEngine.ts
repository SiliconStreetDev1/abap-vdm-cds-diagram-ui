/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview Mermaid.js rendering implementation.
 * @description Handles the initialization and execution of Mermaid diagrams.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";
import DomManager from "../DomManager";

declare const mermaid: any;

export default class MermaidEngine {
    private static _bMermaidInit: boolean = false;

    public static configPath = "/formatMermaid";
    public static supportsMinimap = false;
    public static supportsSearch = false;
    public static supportsSourceExport = true;
    public static supportsImageExport = true;

    /**
     * @public
     * @static
     * @description Renders a Mermaid syntax string into an SVG and injects it into the active UI view.
     * Leaves the original Fiori ID structure fully intact for the Zoom library.
     * @param {string} payload - The raw Mermaid syntax.
     * @param {string} renderId - The target DOM container ID.
     * @param {Function} onError - Error callback.
     * @returns {void}
     */
    public static render(viewId: string, payload: string, renderId: string, onError: (msg: string) => void): void {
        const config = ConfigManager.get();

        NetworkManager.loadScript(config.localPaths?.mermaid, config.cdnPaths?.mermaid).then(() => {
            try {
                if (!this._bMermaidInit) {
                    mermaid.mermaidAPI.initialize({ 
                        startOnLoad: false, 
                        theme: 'default',
                        securityLevel: 'strict',
                        htmlLabels: false, 
                        maxTextSize: 500000, 
                        maxEdges: 10000, 
                        flowchart: {
                            useMaxWidth: false,
                            htmlLabels: false
                        }
                    });
                    this._bMermaidInit = true;
                }

                const sSvgId = "mermaid-svg-" + Date.now();
                const oTarget = document.getElementById(renderId);
                
                if (oTarget) {
                    oTarget.innerHTML = ""; 
                    
                    mermaid.mermaidAPI.render(sSvgId, payload, (svgCode: string) => {
                        oTarget.innerHTML = svgCode;
                        DomManager.attachStandardZoom(renderId);
                    });
                }
            } catch (e: any) {
                onError(`Mermaid Syntax Error: ${e.str || e.message || e}`);
            }
        }).catch((oNetworkError: any) => {
            onError(`Mermaid CDN Error: ${oNetworkError.message || oNetworkError}`);
        });
    }

    /**
     * @public
     * @returns {number} The maximum supported payload size in KB.
     * @description Provides the standard limit for Mermaid.js rendering.
     */
    public static getMaxPayloadSize(): number {
        return 100;
    }

    /**
     * @public
     * @static
     * @description Provides the baseline default configuration for the UI Model.
     */
    public static getDefaultConfig(): Record<string, any> {
        return { direction: "TB", theme: "default" };
    }

    /**
     * @public
     * @description Destroys the Mermaid active context.
     */
    public static destroy(viewId: string): void {
        this._bMermaidInit = false;
    }

    /**
     * @public
     * @static
     * @description Headless execution context for Mermaid to generate a brand NEW raw SVG for export.
     * Operates completely independently of the screen DOM in a transient, off-screen wrapper.
     * @param {string} payload - The raw Mermaid syntax.
     * @returns {Promise<string>} A promise resolving to the raw SVG string.
     */
    public static async exportSvg(payload: string, viewId?: string): Promise<string> {
        const config = ConfigManager.get();
        await NetworkManager.loadScript(config.localPaths?.mermaid, config.cdnPaths?.mermaid);

        return new Promise((resolve, reject) => {
            if (!this._bMermaidInit) {
                mermaid.mermaidAPI.initialize({ 
                    startOnLoad: false, theme: 'default', securityLevel: 'strict',
                    htmlLabels: false, maxTextSize: 500000, maxEdges: 10000, 
                    flowchart: { useMaxWidth: false, htmlLabels: false }
                });
                this._bMermaidInit = true;
            }

            const sExportId = `mermaid-export-${Date.now()}`;
            
            // 1. Create a transient wrapper for the NEW export SVG
            const oExportContainer = document.createElement("div");
            oExportContainer.id = `${sExportId}-wrapper`;
            
            // 2. Position off-screen but retain absolute dimensions so text boxes calculate properly
            Object.assign(oExportContainer.style, {
                position: "absolute",
                top: "-10000px",
                left: "-10000px",
                width: "10000px", 
                visibility: "hidden"
            });
            
            document.body.appendChild(oExportContainer);

            try {
                // 3. Render directly into the hidden wrapper
                mermaid.mermaidAPI.render(sExportId, payload, (sSvgCode: string) => {
                    // 4. Clean up the DOM instantly
                    if (oExportContainer.parentNode) {
                        document.body.removeChild(oExportContainer);
                    }
                    resolve(sSvgCode);
                }, oExportContainer);
                
            } catch (e: any) {
                if (oExportContainer.parentNode) {
                    document.body.removeChild(oExportContainer);
                }
                reject(new Error(`Mermaid Export Error: ${e.str || e.message || e}`));
            }
        });
    }
}