const fs = require('fs');
let file = 'c:/projects/Fiori/abap-vdm-cds-diagram-ui/webapp/renderer/engines/CytoscapeEngine.ts';
let text = fs.readFileSync(file, 'utf8');
text = text.replace('public static getCanvasState', 'public static moveNode(sViewId: string, nodeId: string, position: {x: number, y: number}): void { const ctx = this._cyContexts.get(sViewId); if (ctx && ctx.cy) { ctx.cy.$("#" + nodeId.replace(/\\./g, "\\\\.")).position(position); } }\n\n    /**\n     * @public\n     * @static\n     * @description Extracts the live X/Y canvas coordinates for layout persistence.\n     */\n    public static getCanvasState');
fs.writeFileSync(file, text, 'utf8');
