/**
 * @fileoverview Central configuration for VDM Diagram rendering.
 * @description Isolates all hardcoded limits, CDN URLs, and timeouts to prevent magic strings
 * from cluttering the execution logic. Allows for easy environment-specific overrides.
 */

export const CONFIG = {
    URL_PLANTUML_SERVER: "https://www.plantuml.com/plantuml/svg/",
    MAX_URL_LENGTH: 7000,
    DOM_POLL_INTERVAL_MS: 50,
    DOM_POLL_MAX_ATTEMPTS: 20,
    CDN: {
        MERMAID: "https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js",
        D3: "https://d3js.org/d3.v7.min.js",
        GRAPHVIZ_WASM: "https://unpkg.com/@hpcc-js/wasm@2.14.1/dist/graphviz.umd.js",
        GRAPHVIZ_PLUGIN: "https://unpkg.com/d3-graphviz@5.1.0/build/d3-graphviz.min.js",
        PAKO: "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"
    }
};