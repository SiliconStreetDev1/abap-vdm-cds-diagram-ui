/**
 * @fileoverview Configuration Contract for Diagram Rendering.
 * @description Defines the optional overrides available to consumers of the Renderer facade.
 */

export interface IConfigPaths {
    mermaid?: string;
    d3?: string;
    graphvizWasm?: string;
    graphvizPlugin?: string;
    pako?: string;
    cytoscape?: string; 
    dagre?: string;
    cytoscapeDagre?: string;
    cytoscapeSvg?: string; 
    navigatorJs?: string;
    navigatorCss?: string;
    elk?: string;
    cytoscapeElk?: string;
    gridGuideJs?: string;
}

export interface IDiagramConfig {
    plantUmlServerUrl?: string;
    maxUrlLength?: number;
    domPollIntervalMs?: number;
    domPollMaxAttempts?: number;
    localPaths?: IConfigPaths;
    cdnPaths?: IConfigPaths;
}