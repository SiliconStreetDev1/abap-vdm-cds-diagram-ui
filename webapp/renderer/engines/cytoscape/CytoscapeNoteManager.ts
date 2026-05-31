/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines.cytospace
 * @fileoverview Centralized manager for Cytoscape.js Sticky Note operations.
 * @description Encapsulates addition, modification, and formatting of annotation notes,
 * isolating it from standard event binding or global engine operations.
 */
import { DomEvents } from "../../../constants/EventConstants";

export default class CytoscapeNoteManager {
    private static _cyInstance: any = null;
    private static _fnAddNoteBind: EventListener | null = null;
    private static _fnEditNoteBind: EventListener | null = null;
    private static _fnChangeNoteColorBind: EventListener | null = null;

    /**
     * @public
     * @static
     * @description Binds DOM event listeners and stores the active Cytoscape instance.
     * @param {any} cyInstance - The active Cytoscape.js instance.
     * @returns {void}
     */
    public static attachEvents(cyInstance: any): void {
        this.detachEvents(); // Ensure previous listeners are cleanly wiped

        this._cyInstance = cyInstance;

        this._fnAddNoteBind = this._onAddNoteRequest.bind(this) as EventListener;
        this._fnEditNoteBind = this._onEditNoteRequest.bind(this) as EventListener;
        this._fnChangeNoteColorBind = this._onChangeNoteColorRequest.bind(this) as EventListener;

        if (typeof document !== "undefined") {
            document.addEventListener(DomEvents.ADD_NOTE_REQUEST, this._fnAddNoteBind);
            document.addEventListener(DomEvents.EDIT_NOTE_REQUEST, this._fnEditNoteBind);
            document.addEventListener(DomEvents.CHANGE_NOTE_COLOR_REQUEST, this._fnChangeNoteColorBind);
        }
    }

    /**
     * @public
     * @static
     * @description Unbinds DOM event listeners to prevent memory leaks.
     * @returns {void}
     */
    public static detachEvents(): void {
        if (typeof document !== "undefined") {
            if (this._fnAddNoteBind) document.removeEventListener(DomEvents.ADD_NOTE_REQUEST, this._fnAddNoteBind);
            if (this._fnEditNoteBind) document.removeEventListener(DomEvents.EDIT_NOTE_REQUEST, this._fnEditNoteBind);
            if (this._fnChangeNoteColorBind) document.removeEventListener(DomEvents.CHANGE_NOTE_COLOR_REQUEST, this._fnChangeNoteColorBind);
        }
        
        this._fnAddNoteBind = null;
        this._fnEditNoteBind = null;
        this._fnChangeNoteColorBind = null;
        this._cyInstance = null;
    }

    /**
     * @private
     * @static
     * @description Handles requests to add a new sticky note to the graph.
     * @param {Event} oEvent - Custom DOM Event containing the note text.
     */
    private static _onAddNoteRequest(oEvent: Event): void {
        if (!this._cyInstance) return;

        const oCustomEvent = oEvent as CustomEvent;
        const sText = oCustomEvent.detail?.text;
        const sFontFamily = oCustomEvent.detail?.fontFamily || "Marker";
        if (!sText) return;

        const sId = "note_" + Date.now();
        
        let iX = 0, iY = 0;
        const aSelectedEntities = this._cyInstance.nodes(':selected').difference('.annotation-note');

        if (aSelectedEntities.length > 0) {
            // 1. Contextual Spawning: Offset from the first selected entity
            const oTargetPos = aSelectedEntities[0].position();
            iX = oTargetPos.x + 150;
            iY = oTargetPos.y - 100;
        } else {
            // 2. Spiral Out Collision Detection Algorithm
            const oExtent = this._cyInstance.extent();
            const iCenterX = oExtent.x1 + (oExtent.w / 2);
            const iCenterY = oExtent.y1 + (oExtent.h / 2);
            
            // PERFORMANCE FIX: Pre-map bounding boxes to avoid querying Cytoscape graph inside the spiral loop
            const aExistingBoxes = this._cyInstance.nodes().map((n: any) => n.boundingBox());

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

        this._cyInstance.add({
            group: 'nodes',
            data: { id: sId, label: sText, fontFamily: sFontFamily, bgColor: '#fff9c4', borderColor: '#fbc02d', isNote: true },
            classes: 'annotation-note',
            position: { x: iX, y: iY }
        });

        // Auto-link to currently selected entities
        if (aSelectedEntities.length > 0) {
            aSelectedEntities.forEach((oEntity: any) => {
                this._cyInstance.add({
                    group: 'edges',
                    data: { id: 'edge_' + sId + '_' + oEntity.id(), source: sId, target: oEntity.id() },
                    classes: 'annotation-edge'
                });
            });
        }

        if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, {}));
    }

    /**
     * @private
     * @static
     * @description Handles requests to edit an existing sticky note.
     * @param {Event} oEvent - Custom DOM Event containing the note ID and new text.
     */
    private static _onEditNoteRequest(oEvent: Event): void {
        if (!this._cyInstance) return;

        const oCustomEvent = oEvent as CustomEvent;
        const sId = oCustomEvent.detail?.id;
        const sText = oCustomEvent.detail?.text;
        const sFontFamily = oCustomEvent.detail?.fontFamily;
        
        if (sId && sText) {
            const oNode = this._cyInstance.getElementById(sId);
            if (oNode.length > 0) {
                oNode.data('label', sText);
                if (sFontFamily) oNode.data('fontFamily', sFontFamily);
                if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, {}));
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
        if (!this._cyInstance) return;

        const oCustomEvent = oEvent as CustomEvent;
        const sId = oCustomEvent.detail?.id;
        const sBgColor = oCustomEvent.detail?.bgColor;
        const sBorderColor = oCustomEvent.detail?.borderColor;

        if (sId && sBgColor && sBorderColor) {
            const oNode = this._cyInstance.getElementById(sId);
            if (oNode.length > 0) {
                oNode.data('bgColor', sBgColor);
                oNode.data('borderColor', sBorderColor);
                if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.NODE_DRAGGED, {}));
            }
        }
    }
}