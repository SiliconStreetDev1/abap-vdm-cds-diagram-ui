/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Dependency loader for Cytoscape.js plugins.
 * @description Separates external script loading and plugin registration from the main rendering engine.
 */
import ConfigManager from "../../ConfigManager";
import NetworkManager from "../../../helpers/NetworkManager";

declare const cytoscape: any;

export default class CytoscapeDependencyLoader {
    private static _bDependenciesLoaded = false;

    /**
     * @public
     * @static
     * @description Asynchronously loads required third-party Cytoscape scripts and registers extensions.
     * @returns {Promise<void>} Resolves when all dependencies are successfully attached to the DOM.
     */
    public static async load(): Promise<void> {
        if (this._bDependenciesLoaded) return;

        const config = ConfigManager.get();

        await NetworkManager.loadScript(config.localPaths?.cytoscape, config.cdnPaths?.cytoscape);
        await NetworkManager.loadScript(config.localPaths?.dagre, config.cdnPaths?.dagre);
        await NetworkManager.loadScript(config.localPaths?.cytoscapeDagre, config.cdnPaths?.cytoscapeDagre);
        await NetworkManager.loadScript(config.localPaths?.elk, config.cdnPaths?.elk);
        await NetworkManager.loadScript(config.localPaths?.cytoscapeElk, config.cdnPaths?.cytoscapeElk);
        
        const cyElk = (window as any).cytoscapeElk;
        if (cyElk && typeof cytoscape.use === "function") {
            try { cytoscape.use(cyElk); } catch(e) { console.warn("Failed to register Cytoscape ELK plugin", e); }
        }

        await NetworkManager.loadScript(config.localPaths?.gridGuideJs, config.cdnPaths?.gridGuideJs || "https://unpkg.com/cytoscape-grid-guide@2.3.3/cytoscape-grid-guide.js");
        
        const cyGridGuide = (window as any).cytoscapeGridGuide;
        if (cyGridGuide && typeof cytoscape.use === "function") {
            try { cytoscape.use(cyGridGuide); } catch(e) { console.warn("Failed to register Cytoscape Grid Guide plugin", e); }
        }

        await NetworkManager.loadScript(config.localPaths?.navigatorJs, config.cdnPaths?.navigatorJs);
        
        const nav = (window as any).cytoscapeNavigator;
        if (nav && typeof cytoscape.use === "function") {
            try { cytoscape.use(nav); } catch(e) { console.warn("Failed to register Cytoscape Navigator plugin", e); }
        }

        await NetworkManager.loadScript(config.localPaths?.cytoscapeSvg, config.cdnPaths?.cytoscapeSvg);

        this._bDependenciesLoaded = true;
    }
}