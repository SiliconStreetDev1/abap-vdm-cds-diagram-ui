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
import { DiagramStateStore } from "../../store/DiagramStateStore";
import { AddNoteCommand } from "../../store/commands/AddNoteCommand";

/**
 * @class AnnotationHandler
 * @description Orchestrates Sticky Note operations without tightly coupling to the rendering core.
 */
export default class AnnotationHandler {
    private view: View;
    private subscriptions: Subscription[] = [];
    private isAttached: boolean = false;

    /**
     * @constructor
     * @param {View} view - Reference to the active UI5 view.
     */
    constructor(view: View) {
        this.view = view;
    }

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private getInstanceId(): string {
        return this.view.getController()?.getOwnerComponent()?.getId() || this.view.getId();
    }

    /**
     * @public
     * @description Subscribes to EventBus channels for Sticky Note actions.
     */
    public attachEvents(): void {
        if (this.isAttached) return;

        const em = EventManager.getInstance();
        em.subscribe("canvas:addNoteRequest", this.onAddNoteRequest.bind(this), this.view);
        em.subscribe("canvas:editNoteRequest", this.onEditNoteRequest.bind(this), this.view);
        em.subscribe("canvas:changeNoteColorRequest", this.onChangeNoteColorRequest.bind(this), this.view);
        
        this.isAttached = true;
    }

    /**
     * @public
     * @description Unsubscribes from all events to prevent memory leaks on View exit.
     */
    public detachEvents(): void {
        if (!this.isAttached) return;



        this.isAttached = false;
    }

    /**
     * @private
     * @description Fetches the currently selected engine mode from the UI state.
     * @returns {string} Active Engine identifier.
     */
    private getActiveEngine(): string {
        const diagramData = this.view.getModel("diagramData") as JSONModel;
        return diagramData ? diagramData.getProperty(DiagramData.ENGINE) : Renderer.getDefaultEngine();
    }

    private _getDiagramId(): string {
        const dataModel = this.view.getModel("diagramData") as JSONModel;
        if (!dataModel) return "DEFAULT";
        const aLinks = dataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [];
        const sCurrent = dataModel.getProperty(DiagramData.CURRENT_BREADCRUMB) || dataModel.getProperty(DiagramData.CDS_NAME) || "DEFAULT";
        const aPath = aLinks.map((l: any) => l.name).concat(sCurrent).map((s: string) => s.toUpperCase());
        return aPath.join('|');
    }

    /**
     * @private
     * @description Handles requests to add a new sticky note to the canvas.
     * @param {Object} oPayload - Payload containing text and font preferences.
     */
    private onAddNoteRequest(oPayload: { viewId?: string; text?: string; fontFamily?: string }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        const sText = oPayload?.text;
        const sFontFamily = oPayload?.fontFamily || "Marker";
        if (sText) {
            const noteJson = Renderer.addNote(this.getInstanceId(), this.getActiveEngine(), sText, sFontFamily);
            const command = new AddNoteCommand(this.getInstanceId(), this._getDiagramId(), noteJson, this.getActiveEngine());
            DiagramStateStore.getInstance().getDiagramState(this.getInstanceId(), this._getDiagramId()).history.execute(command);
            EventManager.getInstance().publish("canvas:variantDirty", { viewId: this.getInstanceId() });
        }
    }

    /**
     * @private
     * @description Handles requests to edit an existing sticky note.
     * @param {Object} oPayload - Payload containing target Note ID and new text content.
     */
    private onEditNoteRequest(oPayload: { viewId?: string; noteId?: string; text?: string; fontFamily?: string }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        const sNoteId = oPayload?.noteId;
        const sText = oPayload?.text;
        if (sNoteId && sText) {
            Renderer.editNote(this.getInstanceId(), this.getActiveEngine(), sNoteId, sText, oPayload.fontFamily);
            EventManager.getInstance().publish("canvas:variantDirty", { viewId: this.getInstanceId() });
        }
    }

    /**
     * @private
     * @description Handles requests to visually style an existing sticky note.
     * @param {Object} oPayload - Payload containing note ID and color configuration.
     */
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
