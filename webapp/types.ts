export enum EngineType {
    CYTOSCAPE = "CYTOSCAPE",
    GRAPHVIZ = "GRAPHVIZ",
    MERMAID = "MERMAID",
    PLANTUML = "PLANTUML",
    D2 = "D2"
}

export interface IRenderRequestPayload {
    payload: string;
    extension: string;
    cdsName: string;
    engine: EngineType;
    rootCdsName: string;
    breadcrumbs: string[];
}