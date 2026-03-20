/**
 * @fileoverview Mermaid.js rendering implementation.
 * @description Handles the initialization and execution of Mermaid diagrams.
 * Enforces strict security policies (disabling HTML labels) to prevent
 * Canvas tainting during PNG export, and overrides default node limits
 * to support massive CDS view architectures.
 */
import { CONFIG } from "../util/DiagramConfig";
import NetworkManager from "../util/NetworkManager";
import DomManager from "../util/DomManager";

declare const mermaid: any;

export default class MermaidEngine {
    private static _bMermaidInit: boolean = false;

    /**
     * @public
     * @description Renders a Mermaid syntax string into an SVG and injects it into the DOM.
     * @param {string} sPayload - The raw Mermaid syntax.
     * @param {string} sRenderId - The target DOM container ID.
     * @param {(msg: string) => void} fnOnError - Error callback for syntax or network failures.
     * @returns {void}
     */
    public static render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        NetworkManager.loadScript(CONFIG.CDN.MERMAID).then(() => {
            try {
                if (!this._bMermaidInit) {
                    mermaid.mermaidAPI.initialize({ 
                        startOnLoad: false, 
                        theme: 'default',
                        securityLevel: 'loose',
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
                const oTarget = document.getElementById(sRenderId);
                
                if (oTarget) {
                    oTarget.innerHTML = ""; 
                    
                    mermaid.mermaidAPI.render(sSvgId, sPayload, (svgCode: string) => {
                        oTarget.innerHTML = svgCode;
                        DomManager.attachStandardZoom(sRenderId);
                    });
                }
            } catch (e: any) {
                fnOnError(`Mermaid Syntax Error: ${e.str || e.message || e}`);
            }
        }).catch((oNetworkError: any) => {
            fnOnError(`Mermaid CDN Error: ${oNetworkError.message || oNetworkError}`);
        });
    }
}