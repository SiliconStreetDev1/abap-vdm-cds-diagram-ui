/**
 * @fileoverview Cytoscape.js rendering implementation for interactive ER graphs.
 * @description Translates backend JSON into an interactive Fiori-styled canvas.
 * Edge labels contain Association + Cardinality, while Entity boxes display 
 * only Base Views, Keys, and Standard Fields to eliminate redundancy.
 * Supports offline/local-first loading, CDN fallback, and SVG/PNG exports.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";

declare const cytoscape: any;

/**
 * Standardized Configuration Interface for the Engine
 */
interface ICyConfig {
    layout: string;
    rankDir: string;
    theme: string;
    lineStyle: string;
    animate: boolean;
    nodeSpacing: number;
}

export default class CytoscapeEngine {

    /**
     * @private
     * @description Holds the singleton instance of the Cytoscape canvas.
     */
    private static _cyInstance: any = null;

    /**
     * @public
     * @description Initializes and renders the Cytoscape graph inside the target DOM container.
     * Fetches dependencies using local-first/CDN-fallback strategies before execution.
     * @param {string} sPayload - The JSON payload containing nodes, edges, and config.
     * @param {string} sRenderId - The DOM element ID where the canvas will be injected.
     * @param {function} fnOnError - Callback function to handle rendering errors.
     */
    public static render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        const config = ConfigManager.get();

        // Chain the core engine and then the SVG plugin using local-first resolution with Integrity checking
        NetworkManager.loadScript(config.localPaths?.cytoscape, config.cdnPaths?.cytoscape)
            .then(() => NetworkManager.loadScript(config.localPaths?.dagre, config.cdnPaths?.dagre))
            .then(() => NetworkManager.loadScript(config.localPaths?.cytoscapeDagre, config.cdnPaths?.cytoscapeDagre))
            .then(() => NetworkManager.loadScript(config.localPaths?.cytoscapeSvg, config.cdnPaths?.cytoscapeSvg))
            .then(() => {
                try {
                    const oData = JSON.parse(sPayload);
                    
                    // Fiori UI binds to formatCytoscape. Fallback to format for legacy payloads.
                    const oFormat = oData.config?.formatCytoscape || oData.config?.format || {};
                    const parsedConfig = this._parseConfig(oFormat);

                    const oContainer = document.getElementById(sRenderId);
                    if (!oContainer) {
                        fnOnError("Cytoscape Render Error: Target DOM container not found.");
                        return;
                    }

                    // Destroy existing instance to prevent memory leaks and duplicate canvases
                    if (this._cyInstance) {
                        this._cyInstance.destroy();
                        this._cyInstance = null;
                    }

                    // Unpack Arrays and format Labels for display
                    this._preprocessData(oData.nodes, oData.edges);

                    // Initialize Graph
                    this._cyInstance = cytoscape({
                        container: oContainer,
                        elements: {
                            nodes: oData.nodes || [],
                            edges: oData.edges || []
                        },
                        style: this._buildStylesheet(parsedConfig),
                        layout: this._buildLayoutConfig(parsedConfig),

                        minZoom: 0.1,
                        maxZoom: 3.0,
                        wheelSensitivity: 0.2
                    });

                    // Neighborhood Highlight & Click Dispatcher
                    this._cyInstance.on('tap', (evt: any) => {
                        if (evt.target === this._cyInstance) {
                            // Clicked background: Remove all highlights
                            this._cyInstance.elements().removeClass('faded highlighted');
                        }
                    });

                    this._cyInstance.on('tap', 'node', (evt: any) => {
                        const node = evt.target;
                        const cy = this._cyInstance;

                        // 1. Highlight the connected web (Neighborhood highlighting)
                        cy.elements().removeClass('faded highlighted');
                        const neighborhood = node.closedNeighborhood();
                        cy.elements().difference(neighborhood).addClass('faded');
                        neighborhood.addClass('highlighted');

                        // 2. Dispatch event for the UI5 Side Panel to consume
                        const event = new CustomEvent("CdsNodeClicked", {
                            detail: { viewName: node.data('id') }
                        });
                        document.dispatchEvent(event);
                    });

                    // Use Cytoscape's native double tap event for drill down requests
                    this._cyInstance.on('dbltap', 'node', (evt: any) => {
                        const node = evt.target;
                        const event = new CustomEvent("CdsNodeDrillDownRequest", {
                            detail: { viewName: node.data('id') }
                        });
                        document.dispatchEvent(event);
                    });

                } catch (e: any) {
                    fnOnError(`Cytoscape Parsing Error. Details: ${e.message}`);
                }
            }).catch((oNetworkError: any) => {
                fnOnError(`Cytoscape Loading Error: ${oNetworkError.message || oNetworkError}`);
            });
    }

    /**
     * @public
     * @description Exports the current canvas view as a base64 encoded PNG string.
     * @returns {string} Base64 PNG data URI.
     */
    public static exportPng(): string {
        if (!this._cyInstance) return "";
        return this._cyInstance.png({ bg: '#ffffff', full: true, scale: 2 });
    }

    /**
     * @public
     * @description Exports the current canvas view as a zoomable, centered SVG string.
     * Applies internal CSS for centering while retaining physical dimensions to enable browser scroll-to-zoom.
     * @returns {string} Formatted SVG XML string.
     */
    public static exportSvg(): string {
        if (!this._cyInstance || typeof this._cyInstance.svg !== "function") return "";
        
        // 1. Get the raw rigid SVG string from the plugin. 
        // 'full: true' ensures the mathematical bounding box of the graph is exported.
        let sRawSvg = this._cyInstance.svg({ scale: 1, full: true, bg: '#ffffff' });

        try {
            // 2. Parse the string into an XML DOM document
            const oParser = new DOMParser();
            const oDoc = oParser.parseFromString(sRawSvg, "image/svg+xml");
            const oSvgElement = oDoc.documentElement;

            // 3. Extract the hardcoded pixel dimensions from the plugin
            const sWidth = oSvgElement.getAttribute("width");
            const sHeight = oSvgElement.getAttribute("height");

            // 4. Ensure viewBox is set so vector paths scale correctly internally
            if (!oSvgElement.hasAttribute("viewBox") && sWidth && sHeight) {
                const iWidth = parseFloat(sWidth.replace(/px|pt|em/g, ""));
                const iHeight = parseFloat(sHeight.replace(/px|pt|em/g, ""));
                
                if (!isNaN(iWidth) && !isNaN(iHeight)) {
                    oSvgElement.setAttribute("viewBox", `0 0 ${iWidth} ${iHeight}`);
                }
            }

            // 5. THE SCROLL-TO-ZOOM FIX: Retain fixed absolute pixel dimensions.
            // DO NOT change width/height to 100%. Keeping the absolute pixels forces 
            // the browser to generate native scrollbars instead of zooming into whitespace.
            oSvgElement.setAttribute("style", "margin: 0 auto; display: block; background: #ffffff;");
            
            if (sWidth) oSvgElement.setAttribute("width", sWidth);
            if (sHeight) oSvgElement.setAttribute("height", sHeight);

            // 6. THE "ZOOMED OUT" FIX: Ensure strict aspect ratio proportionality.
            // Removing this causes some browsers to miscalculate the viewBox bounds. 
            // Setting 'xMidYMid meet' ensures the tight bounding box scales perfectly without padding.
            oSvgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

            // 7. Serialize the modified DOM back into a string
            sRawSvg = new XMLSerializer().serializeToString(oDoc);
            
        } catch (e: any) {
            console.warn("Could not apply responsive centering to SVG string.", e);
        }

        return sRawSvg;
    }

    /**
     * @private
     * @description Parses UI5 configuration properties directly from the model payload.
     * @param {any} format - The raw format object from the backend.
     * @returns {ICyConfig} Safe, typed configuration object.
     */
    private static _parseConfig(format: any): ICyConfig {
        return {
            layout: format.layout_algorithm || format.layoutAlgorithm || 'dagre',
            rankDir: format.rank_dir || format.rankDir || 'TB', // Map directly to the ABAP backend state
            theme: format.theme || 'fiori_light',
            lineStyle: format.line_style || format.lineStyle || 'bezier',
            animate: format.animate !== false,
            nodeSpacing: parseInt(format.node_spacing || format.nodeSpacing || "200", 10)
        };
    }

    /**
     * @private
     * @description Translates standardized config into the native Cytoscape layout parameters.
     * @param {ICyConfig} config - The sanitized configuration.
     * @returns {any} The Cytoscape layout configuration object.
     */
    private static _buildLayoutConfig(config: ICyConfig): any {
        let oBaseConfig: any = {
            name: config.layout,
            animate: config.animate,
            padding: 50,
            nodeDimensionsIncludeLabels: true
        };

        switch (config.layout) {
            case 'cose':
                oBaseConfig.idealEdgeLength = (edge: any) => {
                    // Pull compositions extremely tight, let loose associations float further out
                    return edge.data('label')?.toLowerCase().includes('composition') ? config.nodeSpacing / 3 : config.nodeSpacing * 1.5;
                };
                oBaseConfig.edgeElasticity = (edge: any) => {
                    return edge.data('label')?.toLowerCase().includes('composition') ? 500 : 50;
                };
                oBaseConfig.nodeRepulsion = (node: any) => {
                    // Massive repulsion so large entity boxes don't overlap
                    return config.nodeSpacing * 8000;
                };
                oBaseConfig.gravity = 0.15; // Lighter gravity so the web spreads out and breathes
                oBaseConfig.numIter = 3000; // Let the physics simulation run longer to find the perfect resting state
                break;
            case 'breadthfirst':
                oBaseConfig.directed = true; // Force a strict PlantUML-style directed tree
                oBaseConfig.spacingFactor = Math.max(1.2, config.nodeSpacing / 100);
                oBaseConfig.avoidOverlap = true;
                break;
            case 'dagre':
                // Controls Left-to-Right vs Top-to-Bottom mapping
                oBaseConfig.rankDir = config.rankDir;
                oBaseConfig.rankSep = config.nodeSpacing * 1.5; // Reduce vertical stretch to keep lines shorter
                oBaseConfig.nodeSep = config.nodeSpacing / 1.5; // Bring siblings closer together
                oBaseConfig.edgeSep = Math.max(30, config.nodeSpacing / 3); // Keep routing corridors tight
                oBaseConfig.ranker = 'network-simplex'; // Graphviz's core algorithm for minimizing edge crossings
                oBaseConfig.acyclicer = 'greedy'; // Force cycle breaking so feedback loops don't tangle the interior grid
                oBaseConfig.spacingFactor = 1.0; // Remove artificial expansion multiplier
                break;
            case 'grid':
            case 'circle':
                oBaseConfig.spacingFactor = Math.max(1, config.nodeSpacing / 100);
                break;
        }
        return oBaseConfig;
    }

    /**
     * @private
     * @description Iterates through nodes and edges to build the visual labels.
     * @param {any[]} nodes - Array of node objects to mutate.
     * @param {any[]} edges - Array of edge objects to mutate.
     */
    private static _preprocessData(nodes: any[], edges: any[]): void {
        // 1. Format Nodes
        nodes.forEach(node => {
            const data = node.data;
            let fieldLines: string[] = [];

            if (data.baseSources && data.baseSources.length > 0) {
                if (fieldLines.length > 0) fieldLines.push("");
                fieldLines.push("[ BASE ]");
                data.baseSources.forEach((s: string) => fieldLines.push(`   » ${s}`));
            }
            if (data.keys && data.keys.length > 0) {
                if (fieldLines.length > 0) fieldLines.push("");
                fieldLines.push("[ KEYS ]");
                data.keys.forEach((k: string) => fieldLines.push(`   🔑 ${k}`));
            }
            if (data.standard && data.standard.length > 0) {
                if (fieldLines.length > 0) fieldLines.push("");
                fieldLines.push("[ FIELDS ]");
                data.standard.forEach((f: string) => fieldLines.push(`   ▫ ${f}`));
            }
            
            // Safely extract backend-provided associations (this strictly respects the 'Show Association Fields' UI toggle)
            const aAssocs = data.associations || data.associationFields || data.navigations || [];
            if (aAssocs.length > 0) {
                if (fieldLines.length > 0) fieldLines.push("");
                fieldLines.push("[ ASSOCIATIONS ]");
                aAssocs.forEach((a: string) => fieldLines.push(`   🔗 ${a}`));
            }

            const sTitle = data.isUnion ? `« UNION »\n${data.label}` : data.label;
            
            if (fieldLines.length > 0) {
                // Plain-text layout using a solid divider since Cytoscape does not support rich-text inside a single node
                data.displayLabel = sTitle + "\n──────────────────────\n" + fieldLines.join('\n');
            } else {
                data.displayLabel = sTitle;
            }
        });

        // 2. Format Edges
        edges.forEach(edge => {
            const data = edge.data;
            const label = data.label || "";
            const card = data.cardinality || "";

            if (label && card) {
                // Drop cardinality to a new line so Cytoscape has room to wrap long association names
                data.displayLabel = `${label}\n[${card}]`;
            } else if (label || card) {
                data.displayLabel = label || `[${card}]`;
            } else {
                data.displayLabel = "";
            }
        });
    }

    /**
     * @private
     * @description Generates the Cytoscape stylesheet tailored to Fiori design guidelines.
     * @param {ICyConfig} config - The sanitized configuration.
     * @returns {Array<any>} Cytoscape stylesheet array.
     */
    private static _buildStylesheet(config: ICyConfig): Array<any> {
        const isDark = config.theme === 'fiori_dark';
        const colors = {
            bg: isDark ? '#29313a' : '#ffffff',
            border: isDark ? '#6b7a89' : '#89919a',
            text: isDark ? '#fafafa' : '#32363a',
            focalBg: isDark ? '#d84a38' : '#e05915',
            focalText: '#ffffff',
            edgeTextBg: isDark ? '#29313a' : '#ffffff',
            edgeText: isDark ? '#fafafa' : '#32363a'
        };

        return [
            {
                selector: 'node',
                style: {
                    'label': 'data(displayLabel)',
                    'text-wrap': 'wrap',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'text-justification': 'left',
                    'line-height': 1.4,
                    'width': 'label',
                    'height': 'label',
                    'padding': '16px',
                    'background-color': colors.bg,
                    'color': colors.text,
                    'border-width': '1px',
                    'border-color': colors.border,
                    'shape': 'round-rectangle',
                    'font-family': '"72", Arial, Helvetica, sans-serif',
                    'font-size': '12px',
                    'text-max-width': '300px'
                }
            },
            {
                selector: 'node[?isFocal]',
                style: {
                    'background-color': colors.focalBg,
                    'color': colors.focalText,
                    'border-width': '2px',
                    'border-color': '#000000'
                }
            },
            {
                selector: 'node[?isUnion]',
                style: {
                    'border-style': 'dashed',
                    'border-width': '2px'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': 'data(colorHint)',
                    'target-arrow-color': 'data(colorHint)',
                    'target-arrow-shape': 'triangle',
                    'arrow-scale': 1.2,
                    'curve-style': config.lineStyle,
                    'taxi-direction': config.rankDir === 'LR' ? 'rightward' : 'downward',
                    'taxi-turn': 20,
                    'taxi-turn-min-distance': 10,
                    'control-point-step-size': Math.max(30, config.nodeSpacing / 3), // Ensure wider, safer turns for unbundled lines
                    'source-distance-from-node': 10, // Create a physical standoff so lines don't hug the boxes
                    'target-distance-from-node': 10, // Create a physical standoff so lines don't hug the boxes
                    'label': 'data(displayLabel)',
                    'font-family': '"72", Arial, Helvetica, sans-serif',
                    'font-size': '10px',
                    'color': colors.edgeText,
                    'text-background-opacity': 0.9,
                    'text-background-color': colors.edgeTextBg,
                    'text-background-padding': '4px',
                    'text-background-shape': 'roundrectangle',
                    'text-border-opacity': 1,
                    'text-border-width': 1,
                    'text-border-color': 'data(colorHint)',
                    'text-rotation': 'autorotate',
                    'text-wrap': 'wrap',
                    'text-max-width': '140px' // Force long association names to stack like paragraphs
                }
            },
            {
                selector: '.faded',
                style: {
                    'opacity': 0.2,
                    'text-opacity': 0.2
                }
            },
            {
                selector: 'edge.highlighted',
                style: {
                    'width': 4,
                    'line-color': 'data(colorHint)',
                    'target-arrow-color': 'data(colorHint)',
                    'z-index': 9999,
                    'text-background-color': 'data(colorHint)',
                    'color': '#ffffff',
                    'text-border-color': 'data(colorHint)'
                }
            }
        ];
    }
}