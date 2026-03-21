/**
 * @fileoverview Optional External Configuration Orchestrator.
 * @description Manages the retrieval of configuration parameters from an external 
 * JSON file. If the file is absent, it silently falls back to embedded defaults.
 */

import { IDiagramConfig } from "./IDiagramConfig";

export default class ConfigManager {
    
    private static _oActiveConfig: IDiagramConfig = {
        plantUmlServerUrl: "https://www.plantuml.com/plantuml/svg/",
        maxUrlLength: 7000,
        domPollIntervalMs: 50,
        domPollMaxAttempts: 20,
        cdnPaths: {
            mermaid: "https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js",
            d3: "https://d3js.org/d3.v7.min.js",
            graphvizWasm: "https://unpkg.com/@hpcc-js/wasm@2.14.1/dist/graphviz.umd.js",
            graphvizPlugin: "https://unpkg.com/d3-graphviz@5.1.0/build/d3-graphviz.min.js",
            pako: "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js",
            cytoscape: "https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.26.0/cytoscape.min.js"
        }
    };

  /**
     * @public
     * @description Asynchronously attempts to fetch an optional 'config.json'.
     * Utilizes sap.ui.require to ensure correct path resolution across Fiori Launchpads 
     * and standalone sandbox environments.
     * @returns {Promise<IDiagramConfig>} The resolved configuration object.
     */
    public static async initialize(): Promise<IDiagramConfig> {
        try {
            // Example: "siliconstreet/vdm/diagram/config.json"
            const sResolvedUrl = sap.ui.require.toUrl("nz/co/siliconstreet/vdmdiagrammer/config.json");
            
            const oResponse = await fetch(sResolvedUrl);
            
            if (oResponse.ok) {
                const oExternalConfig = await oResponse.json();
                this._merge(this._oActiveConfig, oExternalConfig);
            }
        } catch (oError) {}
        
        return this._oActiveConfig;
    }

    /**
     * @public
     * @description Returns the currently active configuration state.
     * @returns {IDiagramConfig} The complete configuration object.
     */
    public static get(): IDiagramConfig {
        return this._oActiveConfig;
    }

    /**
     * @private
     * @description Recursively deep-merges source override properties.
     * @param {any} target - The destination configuration object.
     * @param {any} source - The external override properties.
     * @returns {any} The merged object.
     */
    private static _merge(target: any, source: any): any {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                Object.assign(source[key], this._merge(target[key], source[key]));
            }
        }
        Object.assign(target, source);
        return target;
    }
}