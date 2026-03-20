/**
 * @fileoverview Configuration Contract for Diagram Rendering.
 * @description Defines the optional overrides available to consumers of the Renderer facade.
 */

export interface IConfigCdnPaths {
    mermaid?: string;
    d3?: string;
    graphvizWasm?: string;
    graphvizPlugin?: string;
    pako?: string;
}

export interface IDiagramConfig {
    plantUmlServerUrl?: string;
    maxUrlLength?: number;
    domPollIntervalMs?: number;
    domPollMaxAttempts?: number;
    cdnPaths?: IConfigCdnPaths;
}