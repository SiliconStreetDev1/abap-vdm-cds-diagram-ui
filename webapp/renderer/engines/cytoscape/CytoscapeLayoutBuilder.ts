/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Layout builder for Cytoscape.js rendering.
 * @description Translates standardized configuration into native Cytoscape layout parameters (e.g., dagre, cose).
 */
import type { EdgeSingular, NodeSingular } from "cytoscape";
import { IParsedCytoscapeConfig } from "./CytoscapeConfigParser";
import { AppConstants } from "../../../constants/StateConstants";

export interface ICytoscapeLayoutConfig {
    name: string;
    [key: string]: any;
}

export default class CytoscapeLayoutBuilder {

    /**
     * @public
     * @static
     * @description Generates the layout configuration object for Cytoscape based on the selected algorithm.
     * @param {IParsedCytoscapeConfig} config - The sanitized configuration.
     * @param {number} [nodeCount=0] - The number of nodes in the graph to aid with circular calculations.
     * @returns {any} The Cytoscape layout configuration object.
     */
    public static build(config: IParsedCytoscapeConfig, nodeCount: number = 0): ICytoscapeLayoutConfig {
        let oBaseConfig: ICytoscapeLayoutConfig = {
            name: config.layout,
            animate: config.animate,
            fit: true,
            padding: 50,
            nodeDimensionsIncludeLabels: true
        };

        // Smart Auto-Scaling: Compress massive diagrams to prevent extreme edge stretching
        const scaleMultiplier = (config.autoScale && nodeCount > 20) 
            ? Math.max(0.4, 1.0 - (nodeCount / 200)) 
            : 1.0;

        switch (config.layout) {
            case 'cose':
                oBaseConfig.idealEdgeLength = (edge: EdgeSingular) => {
                    return (edge.data('label')?.toLowerCase().includes('composition') ? config.nodeSpacing / 3 : config.nodeSpacing * 1.5) * scaleMultiplier;
                };
                oBaseConfig.edgeElasticity = (edge: EdgeSingular) => {
                    return edge.data('label')?.toLowerCase().includes('composition') ? 500 : 50;
                };
                oBaseConfig.nodeRepulsion = (node: NodeSingular) => {
                    return (config.nodeSpacing * 8000) * scaleMultiplier;
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
                oBaseConfig.rankSep = (config.nodeSpacing * 1.5) * scaleMultiplier;
                oBaseConfig.nodeSep = (config.nodeSpacing / 1.5) * scaleMultiplier;
                oBaseConfig.edgeSep = Math.max(AppConstants.NODE_SPACING_MIN, (config.nodeSpacing / 3) * 1.15) * scaleMultiplier;
                oBaseConfig.ranker = 'network-simplex';
                oBaseConfig.acyclicer = 'greedy';
                oBaseConfig.spacingFactor = scaleMultiplier;
                break;
            case 'elk':
                oBaseConfig.elk = {
                    'algorithm': 'layered',
                    'elk.direction': config.rankDir === 'LR' ? 'RIGHT' : 'DOWN',
                    'elk.spacing.nodeNode': config.nodeSpacing * scaleMultiplier,
                    'elk.layered.spacing.nodeNodeBetweenLayers': (config.nodeSpacing * 1.5) * scaleMultiplier,
                    'elk.layered.spacing.edgeNodeBetweenLayers': (config.nodeSpacing / 2) * scaleMultiplier,
                    'elk.layered.spacing.edgeEdgeBetweenLayers': (config.nodeSpacing * 0.575) * scaleMultiplier,
                    'elk.spacing.edgeEdge': (config.nodeSpacing * 0.575) * scaleMultiplier,
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
                oBaseConfig.avoidOverlap = false; // Stop Cytoscape's massive auto-scaling
                oBaseConfig.nodeDimensionsIncludeLabels = false;
                
                // Mathematically calculate the radius using the circumference formula (C = 2 * PI * r)
                const iEffectiveNodes = Math.max(nodeCount, 10); // Prevent tiny rings for small diagrams
                const iCircumference = iEffectiveNodes * (config.nodeSpacing + 50); // Arc length per node
                oBaseConfig.radius = Math.max(iCircumference / (2 * Math.PI), AppConstants.NODE_SPACING_MIN);
                break;
        }
        return oBaseConfig;
    }
}