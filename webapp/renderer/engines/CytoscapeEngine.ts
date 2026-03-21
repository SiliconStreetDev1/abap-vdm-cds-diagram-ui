/**
 * @fileoverview Cytoscape.js rendering implementation for interactive ER graphs.
 * @description Translates backend JSON into an interactive Fiori-styled canvas.
 * Edge labels contain Association + Cardinality, while Entity boxes display 
 * only Base Views, Keys, and Standard Fields to eliminate redundancy.
 */

import ConfigManager from "../ConfigManager";
import NetworkManager from "../../helpers/NetworkManager";

declare const cytoscape: any;

export default class CytoscapeEngine {

    private static _cyInstance: any = null;

    public static render(sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        const config = ConfigManager.get();

        NetworkManager.loadScript(config.cdnPaths?.cytoscape).then(() => {
            try {
                const oData = JSON.parse(sPayload);
                const oFormat = oData.config?.format || {};
                const sTheme = oFormat.theme || 'fiori_light';

                const oContainer = document.getElementById(sRenderId);
                if (!oContainer) {
                  fnOnError("Cytoscape Render Error: Target DOM container not found.");
                    return;
                }

                if (this._cyInstance) {
                    this._cyInstance.destroy();
                    this._cyInstance = null;
                }

                // Unpack Arrays and format Labels
                this._preprocessData(oData.nodes, oData.edges);

                // Initialize Graph
                this._cyInstance = cytoscape({
                    container: oContainer,
                    elements: {
                        nodes: oData.nodes || [],
                        edges: oData.edges || []
                    },
                    style: CytoscapeEngine._getFioriStylesheet(sTheme),

                    // Smart Layout mapping
                    layout: this._getLayoutConfig(oFormat),

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

                    // 2. Dispatch event for the UI5 Side Panel
                    const event = new CustomEvent("CdsNodeClicked", {
                        detail: { viewName: node.data('id') }
                    });
                    document.dispatchEvent(event);
                });

            } catch (e: any) {
                fnOnError(`Cytoscape Parsing Error. Details: ${e.message}`);
            }
        }).catch((oNetworkError: any) => {
            fnOnError(`Cytoscape CDN Error: ${oNetworkError.message || oNetworkError}`);
        });
    }

    public static exportPng(): string {
        if (!this._cyInstance) return "";
        return this._cyInstance.png({ bg: '#ffffff', full: true, scale: 2 });
    }

    private static _getLayoutConfig(oFormat: any): any {
        const sName = oFormat.layout_algorithm || oFormat.layoutAlgorithm || 'cose';
        const iSpacing = parseInt(oFormat.node_spacing || oFormat.nodeSpacing || "200", 10);
        const bAnimate = oFormat.animate ?? true;

        let oBaseConfig: any = {
            name: sName,
            animate: bAnimate,
            padding: 50,
            nodeDimensionsIncludeLabels: true
        };

        switch (sName) {
            case 'cose':
                oBaseConfig.idealEdgeLength = iSpacing;
                oBaseConfig.nodeRepulsion = iSpacing * 4000;
                break;
            case 'dagre':
                oBaseConfig.rankSep = iSpacing;
                oBaseConfig.nodeSep = iSpacing / 2;
                break;
            case 'grid':
            case 'circle':
                oBaseConfig.spacingFactor = Math.max(1, iSpacing / 100);
                break;
        }
        return oBaseConfig;
    }

    private static _preprocessData(nodes: any[], edges: any[]): void {

        // 1. Format Nodes
        nodes.forEach(node => {
            const data = node.data;
            let lines: string[] = [];

            const sTitle = data.isUnion ? `[UNION] ${data.label}` : data.label;
            lines.push(sTitle.toUpperCase());

            if (data.baseSources && data.baseSources.length > 0) {
                lines.push("─ Base Views ─");
                data.baseSources.forEach((s: string) => lines.push(`» ${s}`));
            }
            if (data.keys && data.keys.length > 0) {
                lines.push("─ Keys ─");
                data.keys.forEach((k: string) => lines.push(`🔑 ${k}`));
            }
            if (data.standard && data.standard.length > 0) {
                lines.push("─ Fields ─");
                data.standard.forEach((f: string) => lines.push(`▫ ${f}`));
            }
            // NOTE: We intentionally exclude data.associations here to avoid redundancy!

            data.displayLabel = lines.join('\n');
        });

        // 2. Format Edges
        edges.forEach(edge => {
            const data = edge.data;
            const label = data.label || "";
            const card = data.cardinality || "";

            // THE FIX: Put the Association Name next to the Cardinality on the line
            if (label && card) {
                data.displayLabel = `${label} [${card}]`;
            } else if (label || card) {
                data.displayLabel = label || `[${card}]`;
            } else {
                data.displayLabel = "";
            }
        });
    }

    private static _getFioriStylesheet(sTheme: string): Array<any> {
        const isDark = sTheme === 'fiori_dark';
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
                    'font-family': '"72", "72full", Arial, Helvetica, sans-serif',
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
                    'curve-style': 'bezier',
                    'control-point-step-size': 60,
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
                    'text-rotation': 'autorotate'
                }
            },
            {
                // The Dimming Effect (Neighborhood Highlight)
                selector: '.faded',
                style: {
                    'opacity': 0.2,
                    'text-opacity': 0.2
                }
            },
            {

                // THE FIX: Keeps the current line colors while highlighted
                selector: 'edge.highlighted',
                style: {
                    'width': 4,
                    'line-color': 'data(colorHint)', // Dynamically pull color from ABAP data
                    'target-arrow-color': 'data(colorHint)',
                    'z-index': 9999,
                    'text-background-color': 'data(colorHint)',
                    'color': '#ffffff', // White text for contrast on colored background
                    'text-border-color': 'data(colorHint)'
                }
            }
        ];
    }
}