/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Layout builder for Cytoscape.js rendering.
 * @description Translates standardized configuration into native Cytoscape layout parameters (e.g., dagre, cose).
 */
import { ICyConfig } from "../../../types";

export default class CytoscapeLayoutBuilder {

    /**
     * @public
     * @static
     * @description Generates the layout configuration object for Cytoscape based on the selected algorithm.
     * @param {ICyConfig} config - The sanitized configuration.
     * @returns {any} The Cytoscape layout configuration object.
     */
    public static build(config: ICyConfig): any {
        let oBaseConfig: any = {
            name: config.layout,
            animate: config.animate,
            padding: 50,
            nodeDimensionsIncludeLabels: true
        };

        switch (config.layout) {
            case 'cose':
                oBaseConfig.idealEdgeLength = (edge: any) => {
                    return edge.data('label')?.toLowerCase().includes('composition') ? config.nodeSpacing / 3 : config.nodeSpacing * 1.5;
                };
                oBaseConfig.edgeElasticity = (edge: any) => {
                    return edge.data('label')?.toLowerCase().includes('composition') ? 500 : 50;
                };
                oBaseConfig.nodeRepulsion = (node: any) => {
                    return config.nodeSpacing * 8000;
                };
                oBaseConfig.gravity = 0.15;
                oBaseConfig.numIter = 3000;
                break;
            case 'breadthfirst':
                oBaseConfig.directed = true;
                oBaseConfig.spacingFactor = Math.max(1.2, config.nodeSpacing / 100);
                oBaseConfig.avoidOverlap = true;
                break;
            case 'dagre':
                oBaseConfig.rankDir = config.rankDir;
                oBaseConfig.rankSep = config.nodeSpacing * 1.5;
                oBaseConfig.nodeSep = config.nodeSpacing / 1.5;
                oBaseConfig.edgeSep = Math.max(30, config.nodeSpacing / 3);
                oBaseConfig.ranker = 'network-simplex';
                oBaseConfig.acyclicer = 'greedy';
                oBaseConfig.spacingFactor = 1.0;
                break;
            case 'elk':
                oBaseConfig.elk = {
                    'algorithm': 'layered',
                    'elk.direction': config.rankDir === 'LR' ? 'RIGHT' : 'DOWN',
                    'elk.spacing.nodeNode': config.nodeSpacing,
                    'elk.layered.spacing.nodeNodeBetweenLayers': config.nodeSpacing * 1.5,
                    'elk.layered.spacing.edgeNodeBetweenLayers': config.nodeSpacing / 2,
                    'elk.layered.spacing.edgeEdgeBetweenLayers': config.nodeSpacing / 2,
                    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
                    'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
                    'elk.edgeRouting': config.lineStyle === 'taxi' ? 'ORTHOGONAL' : 'SPLINES'
                };
                break;
            case 'grid':
                oBaseConfig.spacingFactor = Math.max(0.5, config.nodeSpacing / 200);
                oBaseConfig.nodeDimensionsIncludeLabels = false;
                break;
            case 'circle':
                oBaseConfig.spacingFactor = Math.max(0.5, config.nodeSpacing / 200);
                oBaseConfig.nodeDimensionsIncludeLabels = false;
                oBaseConfig.avoidOverlap = false; // Stop the algorithm from inflating the circle
                oBaseConfig.radius = config.nodeSpacing * 3; // Hardwire the diameter to the UI slider
                break;
        }
        return oBaseConfig;
    }
}