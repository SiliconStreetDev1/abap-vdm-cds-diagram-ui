/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Data processor for Cytoscape.js payloads.
 * @description Iterates through nodes and edges to build formatted visual labels and process entity structures.
 */
export default class CytoscapeDataProcessor {

    /**
     * @public
     * @static
     * @description Unpacks raw node and edge arrays and formats their display labels.
     * @param {any[]} nodes - Array of node objects to mutate.
     * @param {any[]} edges - Array of edge objects to mutate.
     * @returns {void}
     */
    public static process(nodes: any[], edges: any[]): void {
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
            
            const aAssocs = data.associations || data.associationFields || data.navigations || [];
            if (aAssocs.length > 0) {
                if (fieldLines.length > 0) fieldLines.push("");
                fieldLines.push("[ ASSOCIATIONS ]");
                aAssocs.forEach((a: string) => fieldLines.push(`   🔗 ${a}`));
            }

            const sTitle = data.isUnion ? `« UNION »\n${data.label}` : data.label;
            
            if (fieldLines.length > 0) {
                data.displayLabel = sTitle + "\n──────────────────────\n" + fieldLines.join('\n');
            } else {
                data.displayLabel = sTitle;
            }
        });

        edges.forEach(edge => {
            const data = edge.data;
            const label = data.label || "";
            const card = data.cardinality || "";

            if (label && card) {
                data.displayLabel = `${label}\n[${card}]`;
            } else if (label || card) {
                data.displayLabel = label || `[${card}]`;
            } else {
                data.displayLabel = "";
            }
        });
    }
}