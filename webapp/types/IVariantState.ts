/**
 * @fileoverview Strict typing for LocalStorage and UI5 Model Variant persistence.
 */

export interface IVariantState {
    name: string;
    cdsName: string;
    engine: string;
    maxLevel: number;
    keys: boolean;
    fields: boolean;
    assocFields: boolean;
    base: boolean;
    customOnly: boolean;
    relMode: string;
    discAssoc: boolean;
    discComp: boolean;
    discInherit: boolean;
    lineAssoc: boolean;
    lineComp: boolean;
    lineInherit: boolean;
    includeCds: string;
    excludeCds: string;
    formatPlantUML: Record<string, unknown>;
    formatGraphviz: Record<string, unknown>;
    formatMermaid: Record<string, unknown>;
    formatCytoscape: Record<string, unknown>;
    canvasState: Record<string, { x: number, y: number, isPinned?: boolean, isHidden?: boolean }> | null;
}