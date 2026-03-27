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
    cytoscapeSvg?: string; 
}

export interface IDiagramConfig {
    plantUmlServerUrl?: string;
    maxUrlLength?: number;
    domPollIntervalMs?: number;
    domPollMaxAttempts?: number;
    localPaths?: IConfigPaths;
    cdnPaths?: IConfigPaths;
}