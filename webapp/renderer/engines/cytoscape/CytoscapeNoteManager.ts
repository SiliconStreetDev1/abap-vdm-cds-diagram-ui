/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Centralized manager for Cytoscape.js Sticky Note operations.
 * @description Encapsulates addition, modification, and formatting of annotation notes,
 * isolating it from standard event binding or global engine operations.
 */
import { DomEvents } from "../../../constants/EventConstants";

export default class CytoscapeNoteManager {
    private static _cyInstances: Map<string, any> = new Map();
    private static _bIsBound = false;

    /**
     * @public
     * @static
     * @description Binds DOM event listeners and stores the active Cytoscape instance.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @returns {void}
     */
    public static attachEvents(sViewId: string, cyInstance: any): void {

        this._cyInstances.set(sViewId, cyInstance);

        if (!this._bIsBound && typeof document !== "undefined") {
            document.addEventListener(DomEvents.ADD_NOTE_REQUEST, this._onAddNoteRequest.bind(this) as EventListener);
            document.addEventListener(DomEvents.EDIT_NOTE_REQUEST, this._onEditNoteRequest.bind(this) as EventListener);
            document.addEventListener(DomEvents.CHANGE_NOTE_COLOR_REQUEST, this._onChangeNoteColorRequest.bind(this) as EventListener);
            this._bIsBound = true;
        }
    }

    /**
     * @public
     * @static
     * @description Unbinds DOM event listeners to prevent memory leaks.
     * @returns {void}
     */
    public static detachEvents(sViewId: string): void {
        this._cyInstances.delete(sViewId);
    }

    /**
     * @private
     * @static
     * @description Handles requests to add a new sticky note to the graph.
     * @param {Event} oEvent - Custom DOM Event containing the note text.
     */
    private static _onAddNoteRequest(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent;
        const sViewId = oCustomEvent.detail?.viewId;
        const cyInstance = this._cyInstances.get(sViewId);
        if (!cyInstance) return;
        
        const sText = oCustomEvent.detail?.text;
        const sFontFamily = oCustomEvent.detail?.fontFamily || "Marker";
        if (!sText) return;

        const sId = "note_" + Date.now();
        
        let iX = 0, iY = 0;
        const aSelectedEntities = cyInstance.nodes(':selected').difference('.annotation-note');

        if (aSelectedEntities.length > 0) {
            // 1. Contextual Spawning: Offset from the first selected entity
            const oTargetPos = aSelectedEntities[0].position();
            iX = oTargetPos.x + 150;
            iY = oTargetPos.y - 100;
        } else {
            // 2. Spiral Out Collision Detection Algorithm
            const oExtent = cyInstance.extent();
            const iCenterX = oExtent.x1 + (oExtent.w / 2);
            const iCenterY = oExtent.y1 + (oExtent.h / 2);
            
            // PERFORMANCE FIX: Pre-map bounding boxes to avoid querying Cytoscape graph inside the spiral loop
            const aExistingBoxes = cyInstance.nodes().map((n: any) => n.boundingBox());

            let iRadius = 0;
            let iAngle = 0;
            let bFoundEmpty = false;
            
            while (!bFoundEmpty && iRadius < 3000) {
                iX = iCenterX + iRadius * Math.cos(iAngle);
                iY = iCenterY + iRadius * Math.sin(iAngle);
                
                const bOverlaps = aExistingBoxes.some((oBox: any) => {
                    return !(iX + 90 < oBox.x1 || iX - 90 > oBox.x2 || iY + 50 < oBox.y1 || iY - 50 > oBox.y2);
                });
                
                if (!bOverlaps) bFoundEmpty = true;
                else {
                    iAngle += 0.5; // Rotate trajectory
                    iRadius += 20; // Expand spiral outward
                }
            }
        }

        cyInstance.add({
            group: 'nodes',
            data: { id: sId, label: sText, fontFamily: sFontFamily, bgColor: '#fff9c4', borderColor: '#fbc02d', isNote: true },
            classes: 'annotation-note',
            position: { x: iX, y: iY }
        });

        // Auto-link to currently selected entities
        if (aSelectedEntities.length > 0) {
            aSelectedEntities.forEach((oEntity: any) => {
                cyInstance.add({
                    group: 'edges',
                    data: { id: 'edge_' + sId + '_' + oEntity.id(), source: sId, target: oEntity.id() },
                    classes: 'annotation-edge'
                });
            });
        }

        if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, { detail: { viewId: sViewId } }));
    }

    /**
     * @private
     * @static
     * @description Handles requests to edit an existing sticky note.
     * @param {Event} oEvent - Custom DOM Event containing the note ID and new text.
     */
    private static _onEditNoteRequest(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent;
        const sViewId = oCustomEvent.detail?.viewId;
        const cyInstance = this._cyInstances.get(sViewId);
        if (!cyInstance) return;
        
        const sId = oCustomEvent.detail?.id;
        const sText = oCustomEvent.detail?.text;
        const sFontFamily = oCustomEvent.detail?.fontFamily;
        
        if (sId && sText) {
            const oNode = cyInstance.getElementById(sId);
            if (oNode.length > 0) {
                oNode.data('label', sText);
                if (sFontFamily) oNode.data('fontFamily', sFontFamily);
                if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, { detail: { viewId: sViewId } }));
            }
        }
    }

    /**
     * @private
     * @static
     * @description Handles requests to change the color of an existing sticky note.
     * @param {Event} oEvent - Custom DOM Event containing the note ID, bgColor, and borderColor.
     */
    private static _onChangeNoteColorRequest(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent;
        const sViewId = oCustomEvent.detail?.viewId;
        const cyInstance = this._cyInstances.get(sViewId);
        if (!cyInstance) return;
        
        const sId = oCustomEvent.detail?.id;
        const sBgColor = oCustomEvent.detail?.bgColor;
        const sBorderColor = oCustomEvent.detail?.borderColor;

        if (sId && sBgColor && sBorderColor) {
            const oNode = cyInstance.getElementById(sId);
            if (oNode.length > 0) {
                oNode.data('bgColor', sBgColor);
                oNode.data('borderColor', sBorderColor);
                if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, { detail: { viewId: sViewId } }));
            }
        }
    }
}