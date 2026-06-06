/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers.canvas
 * @fileoverview Centralized manager for Sticky Note operations.
 * @description Encapsulates addition, modification, and formatting of annotation notes,
 * isolating it from standard event binding or global engine operations.
 */
import { EventManager } from "../../events/EventManager";
import Renderer from "../../renderer/Renderer";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Subscription } from "../../events/Subscription";
import { DiagramData } from "../../constants/StateConstants";
import View from "sap/ui/core/mvc/View";

export default class AnnotationHandler {
    private view: View;
    private subscriptions: Subscription[] = [];
    private isAttached: boolean = false;

    constructor(view: View) {
        this.view = view;
    }

    private getInstanceId(): string {
        return this.view.getController()?.getOwnerComponent()?.getId() || this.view.getId();
    }

    public attachEvents(): void {
        if (this.isAttached) return;

        const em = EventManager.getInstance();
        this.subscriptions.push(em.subscribe("canvas:addNoteRequest", this.onAddNoteRequest.bind(this)));
        this.subscriptions.push(em.subscribe("canvas:editNoteRequest", this.onEditNoteRequest.bind(this)));
        this.subscriptions.push(em.subscribe("canvas:changeNoteColorRequest", this.onChangeNoteColorRequest.bind(this)));
        
        this.isAttached = true;
    }

    public detachEvents(): void {
        if (!this.isAttached) return;

        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        this.isAttached = false;
    }

    private getActiveEngine(): string {
        const diagramData = this.view.getModel("diagramData") as JSONModel;
        return diagramData ? diagramData.getProperty(DiagramData.ENGINE) : "CYTOSCAPE";
    }

    private onAddNoteRequest(oPayload: { viewId?: string; text?: string; fontFamily?: string }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        const sText = oPayload?.text;
        const sFontFamily = oPayload?.fontFamily || "Marker";
        if (sText) {
            Renderer.addNote(this.getInstanceId(), this.getActiveEngine(), sText, sFontFamily);
            EventManager.getInstance().publish("canvas:variantDirty", { viewId: this.getInstanceId() });
        }
    }

    private onEditNoteRequest(oPayload: { viewId?: string; noteId?: string; text?: string; fontFamily?: string }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        const sNoteId = oPayload?.noteId;
        const sText = oPayload?.text;
        if (sNoteId && sText) {
            Renderer.editNote(this.getInstanceId(), this.getActiveEngine(), sNoteId, sText, oPayload.fontFamily);
            EventManager.getInstance().publish("canvas:variantDirty", { viewId: this.getInstanceId() });
        }
    }

    private onChangeNoteColorRequest(oPayload: { viewId?: string; noteId?: string; bgColor?: string; borderColor?: string }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        const sNoteId = oPayload?.noteId;
        const sBgColor = oPayload?.bgColor;
        const sBorderColor = oPayload?.borderColor;
        if (sNoteId && sBgColor && sBorderColor) {
            Renderer.changeNoteColor(this.getInstanceId(), this.getActiveEngine(), sNoteId, sBgColor, sBorderColor);
            EventManager.getInstance().publish("canvas:variantDirty", { viewId: this.getInstanceId() });
        }
    }
}
