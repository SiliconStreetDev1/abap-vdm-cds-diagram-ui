/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Style builder for Cytoscape.js rendering.
 * @description Generates the Cytoscape stylesheet array tailored to Fiori design guidelines.
 */
import { ICyConfig } from "./types/ICyConfig";

export default class CytoscapeStyleBuilder {

    /**
     * @public
     * @static
     * @description Builds the array of CSS-like selector styles for the Cytoscape graph elements.
     * @param {ICyConfig} config - The sanitized configuration containing theme and layout settings.
     * @returns {Array<any>} An array of Cytoscape style definitions.
     */
    public static build(config: ICyConfig): Array<any> {
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
                selector: 'node.search-highlight',
                style: {
                    'underlay-color': '#0854a0',
                    'underlay-padding': '12px',
                    'underlay-opacity': 0.6
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': '4px',
                    'border-color': '#0854a0'
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
                    'control-point-step-size': Math.max(30, config.nodeSpacing / 3),
                    'source-distance-from-node': 10,
                    'target-distance-from-node': 10,
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
                    'text-max-width': '140px'
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