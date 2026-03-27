
/**
 * @fileoverview Optional External Configuration Orchestrator.
 * @description Manages the retrieval of configuration parameters from external 
 * JSON files. Loads defaults first, then silently applies optional customer overrides.
 */

import { IDiagramConfig } from "./IDiagramConfig";

export default class ConfigManager {
    
    // Initialized as an empty object; populated via fetch requests
    private static _oActiveConfig: IDiagramConfig = {};
    private static _bIsInitialized: boolean = false;

    /**
     * @public
     * @description Asynchronously fetches the base defaults and optional overrides.
     * Caches the result to prevent redundant network calls on subsequent renders.
     * @returns {Promise<IDiagramConfig>} The resolved configuration object.
     */
    public static async initialize(): Promise<IDiagramConfig> {
        // Return immediately if we have already built the config object during this session
        if (this._bIsInitialized) {
            return this._oActiveConfig;
        }

        try {
            // STEP 1: Load the mandatory baseline configuration
            const sDefaultUrl = sap.ui.require.toUrl("nz/co/siliconstreet/vdmdiagrammer/config.default.json");
            const oDefaultResponse = await fetch(sDefaultUrl);
            
            if (oDefaultResponse.ok) {
                this._oActiveConfig = await oDefaultResponse.json();
            } else {
                console.error("Critical Error: config.default.json could not be loaded. The application may fail to render diagrams.");
            }

            // STEP 2: Attempt to load the optional customer override configuration
            const sOverrideUrl = sap.ui.require.toUrl("nz/co/siliconstreet/vdmdiagrammer/config.json");
            const oOverrideResponse = await fetch(sOverrideUrl);
            
            if (oOverrideResponse.ok) {
                const oExternalConfig = await oOverrideResponse.json();
                this._merge(this._oActiveConfig, oExternalConfig);
            }
        } catch (oError) {
            // A 404 on the optional config.json will naturally fall into this catch block.
            // We swallow the error silently as the baseline config is already safely loaded.
        }
        
        this._bIsInitialized = true;
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
     * @description Recursively deep-merges source override properties into the target object.
     * This ensures partial overrides (e.g., overriding only one CDN link) do not destroy the rest.
     * @param {any} target - The destination configuration object (Defaults).
     * @param {any} source - The external override properties (User Config).
     * @returns {any} The merged object.
     */
    private static _merge(target: any, source: any): any {
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                Object.assign(source[key], this._merge(target[key], source[key]));
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }
}