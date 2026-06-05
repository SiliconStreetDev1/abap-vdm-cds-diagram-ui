/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace.menu
 * @fileoverview Sticky Note context menu strategy.
 * @description Permits editing, linking, and deleting visual sticky notes.
 */
import type { Core, NodeCollection, NodeSingular } from "cytoscape";
import BaseMenuStrategy from "./BaseMenuStrategy";
import { DomEvents } from "../../../../constants/EventConstants";

export default class BuilderNoteMenuStrategy extends BaseMenuStrategy {
    public build(menu: HTMLDivElement, targetNodes: NodeCollection, clickedNode: NodeSingular, cyInstance: Core, suffix: string, totalCount: number): void {
        menu.appendChild(this._createMenuItem("✏️", `Edit Note${suffix}`, "#f57c00", () => {
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.PROMPT_EDIT_NOTE_REQUEST, { detail: { viewId: this._sViewId, id: clickedNode.id(), text: clickedNode.data('label'), fontFamily: clickedNode.data('fontFamily') } }));
        }));

        const selectedEntities = cyInstance.nodes(':selected').difference('.annotation-note');
        if (selectedEntities.length > 0) {
            menu.appendChild(this._createMenuItem("🔗", `Link to Selected (${selectedEntities.length})`, "#0070f2", () => {
                targetNodes.forEach((n: NodeSingular) => {
                    selectedEntities.forEach((e: NodeSingular) => {
                        const edgeId = 'edge_' + n.id() + '_' + e.id();
                        if (cyInstance.getElementById(edgeId).length === 0) cyInstance.add({ group: 'edges', data: { id: edgeId, source: n.id(), target: e.id() }, classes: 'annotation-edge' });
                    });
                });
                if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, { detail: { viewId: this._sViewId } }));
            }));
        }
        menu.appendChild(this._createMenuItem("✂️", `Unlink${suffix}`, "#d32f2f", () => { targetNodes.connectedEdges('.annotation-edge').remove(); if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, { detail: { viewId: this._sViewId } })); }));
        menu.appendChild(this._createMenuItem("🗑️", `Delete Note${suffix}`, "#d32f2f", () => { targetNodes.remove(); if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, { detail: { viewId: this._sViewId } })); }));
        
        menu.appendChild(document.createElement("hr")).style.cssText = "margin: 0.25rem 0; border: none; border-top: 1px solid var(--sapContent_ForegroundBorderColor, #e5e5e5);";

        menu.appendChild(this._createMenuItem("🟡", `Yellow${suffix}`, "#fbc02d", () => { targetNodes.forEach((n: NodeSingular) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { viewId: this._sViewId, id: n.id(), bgColor: '#fff9c4', borderColor: '#fbc02d' } }))); }));
        menu.appendChild(this._createMenuItem("🔵", `Blue${suffix}`, "#1976d2", () => { targetNodes.forEach((n: NodeSingular) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { viewId: this._sViewId, id: n.id(), bgColor: '#e3f2fd', borderColor: '#1976d2' } }))); }));
        menu.appendChild(this._createMenuItem("🟢", `Green${suffix}`, "#388e3c", () => { targetNodes.forEach((n: NodeSingular) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { viewId: this._sViewId, id: n.id(), bgColor: '#e8f5e9', borderColor: '#388e3c' } }))); }));
        menu.appendChild(this._createMenuItem("🔴", `Pink${suffix}`, "#d32f2f", () => { targetNodes.forEach((n: NodeSingular) => document.dispatchEvent(new CustomEvent(DomEvents.CHANGE_NOTE_COLOR_REQUEST, { detail: { viewId: this._sViewId, id: n.id(), bgColor: '#ffebee', borderColor: '#d32f2f' } }))); }));
    }
}