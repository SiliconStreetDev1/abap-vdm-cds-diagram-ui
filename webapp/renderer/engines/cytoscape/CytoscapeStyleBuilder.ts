/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Style builder for Cytoscape.js rendering.
 * @description Generates the Cytoscape stylesheet array tailored to Fiori design guidelines.
 */
import { IParsedCytoscapeConfig } from "./CytoscapeConfigParser";

export default class CytoscapeStyleBuilder {

    /**
     * @public
     * @static
     * @description Builds the array of CSS-like selector styles for the Cytoscape graph elements.
     * @param {IParsedCytoscapeConfig} config - The sanitized configuration containing theme and layout settings.
     * @returns {Array<any>} An array of Cytoscape style definitions.
     */
    public static build(config: IParsedCytoscapeConfig): Array<Record<string, any>> {
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

        const styles = [
            {
                // Overrides the native loud blue selection box with a clean Fiori-styled glass pane
                selector: 'core',
                style: {
                    'selection-box-color': '#0854a0',
                    'selection-box-border-color': '#0854a0',
                    'selection-box-border-width': '1px',
                    'selection-box-opacity': 0.1,
                    'active-bg-color': '#0854a0',
                    'active-bg-opacity': 0.15,
                    'active-bg-size': '15px'
                }
            },
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
                selector: 'node[?isPinned]',
                style: {
                    'border-width': '2px',
                    'border-color': '#d32f2f',
                    'border-style': 'solid',
                    // Base64 SVG hardened with explicit width="24" height="24" to prevent Canvas 0x0 clipping bugs
                    'background-image': 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjZDMyZjJmIiBkPSJNMTYgMTJWNGgxVjJIN3YyaDF2OGwtMiAydjJoNS4ydjZoMS42di02SDE4di0ybC0yLTJ6Ii8+PC9zdmc+',
                    'background-position-x': '100%',
                    'background-position-y': '0%',
                    'background-width': '24px',
                    'background-height': '24px',
                    'background-clip': 'none',
                    'background-fit': 'none'
                }
            },
            {
                selector: 'node[?isPinned]:selected',
                style: {
                    'border-width': '4px',
                    'border-color': '#d32f2f', // Retain the critical red anchor warning
                    'underlay-color': '#0854a0', // Apply the Fiori selection blue as a glowing underlay
                    'underlay-padding': '8px',
                    'underlay-opacity': 0.5
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
        },
        {
            selector: '.hidden',
            style: {
                'display': 'none'
            }
            }
        ];

        return styles;
    }
}
