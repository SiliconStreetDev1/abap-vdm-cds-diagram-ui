/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Undo (Ctrl+Z) state tracking via the DiagramStateStore and Command Pattern.
 * @description Option 2 implementation: State Snapshotting via Command Pattern.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import { EventManager } from "../../events/EventManager";
import { Subscription } from "../../events/Subscription";
import { DiagramData } from "../../constants/StateConstants";
import { DiagramStateStore } from "../../store/DiagramStateStore";
import { MoveNodeCommand } from "../../store/commands/MoveNodeCommand";

export default class DiagramStateActionHandler {
    private _oView: View;
    private _subscriptions: Subscription[] = [];
    private _bIsAttached: boolean = false;

    /**
     * @public
     * @param {View} oView - The active UI5 View.
     */
    constructor(oView: View) {
        this._oView = oView;
    }

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    /**
     * @private
     * @description Resolves the current Diagram ID.
     */
    private _getDiagramId(): string {
        const oDataModel = this._oView.getModel("diagramData") as JSONModel;
        if (!oDataModel) return "DEFAULT";
        const aLinks = oDataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [];
        const sCurrent = oDataModel.getProperty(DiagramData.CURRENT_BREADCRUMB) || oDataModel.getProperty(DiagramData.CDS_NAME) || "DEFAULT";
        const aPath = aLinks.map((l: any) => l.name).concat(sCurrent).map((s: string) => s.toUpperCase());
        return aPath.join('|');
    }

    /**
     * @public
     * @description Attaches custom DOM event listeners for undo and state changes.
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;

        if (typeof document !== "undefined") {
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:undoRequest", this._onUndoRequest.bind(this)));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:redoRequest", this._onRedoRequest.bind(this)));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodePositionChanged", this._onNodePositionChanged.bind(this)));
        }
        
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches custom DOM event listeners to prevent memory leaks.
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;
        this._subscriptions.forEach(sub => sub.dispose());
        this._subscriptions = [];
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Flushes the undo history stack.
     */
    public clearHistory(): void {
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), this._getDiagramId()).history.clear();
    }

    private _onNodePositionChanged(payload: { viewId?: string; diagramId?: string; nodeId: string; oldPos: {x: number, y: number}; newPos: {x: number, y: number} }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;

        const diagramId = payload.diagramId || this._getDiagramId();
        const command = new MoveNodeCommand(this._getInstanceId(), diagramId, payload.nodeId, payload.oldPos, payload.newPos);
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), diagramId).history.execute(command);
    }

    private _onUndoRequest(payload: { viewId?: string }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), this._getDiagramId()).history.undo();
    }

    private _onRedoRequest(payload: { viewId?: string }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), this._getDiagramId()).history.redo();
    }
}
