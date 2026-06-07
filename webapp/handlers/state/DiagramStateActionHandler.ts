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
import { MoveNodesCommand } from "../../store/commands/MoveNodesCommand";
import { DeleteSelectionCommand } from "../../store/commands/DeleteSelectionCommand";
import Renderer from "../../renderer/Renderer";

export default class DiagramStateActionHandler {
    private _oView: View;
    private _subscriptions: Subscription[] = [];
    private _bIsAttached: boolean = false;

    /**
     * @public
     * @param {View} activeView - The active UI5 View.
     */
    constructor(activeView: View) {
        this._oView = activeView;
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
        const dataModel = this._oView.getModel("diagramData") as JSONModel;
        if (!dataModel) return "DEFAULT";
        const aLinks = dataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [];
        const sCurrent = dataModel.getProperty(DiagramData.CURRENT_BREADCRUMB) || dataModel.getProperty(DiagramData.CDS_NAME) || "DEFAULT";
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
            EventManager.getInstance().subscribe("canvas:undoRequest", this._onUndoRequest.bind(this), this._oView);
            EventManager.getInstance().subscribe("canvas:redoRequest", this._onRedoRequest.bind(this), this._oView);
            EventManager.getInstance().subscribe("canvas:nodePositionChanged", this._onNodePositionChanged.bind(this), this._oView);
            EventManager.getInstance().subscribe("canvas:nodesPositionChanged", this._onNodesPositionChanged.bind(this), this._oView);
            EventManager.getInstance().subscribe("canvas:nodeHidden", this._onNodeHidden.bind(this), this._oView);
        }
        
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches custom DOM event listeners to prevent memory leaks.
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;


        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Flushes the undo history stack.
     */
    public clearHistory(): void {
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), this._getDiagramId()).history.clear();
    }

    private _onNodePositionChanged(payload: { viewId?: string; diagramId?: string; nodeId: string; oldPos: {x: number, y: number}; newPos: {x: number, y: number}; engine: string }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;

        const diagramId = payload.diagramId || this._getDiagramId();
        const batchPayload = [{ nodeId: payload.nodeId, oldPos: payload.oldPos, newPos: payload.newPos }];
        const command = new MoveNodesCommand(this._getInstanceId(), diagramId, batchPayload, payload.engine);
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), diagramId).history.execute(command);
    }

    private _onNodesPositionChanged(payload: { viewId?: string; diagramId?: string; nodes: { nodeId: string; oldPos: {x: number, y: number}; newPos: {x: number, y: number} }[]; engine: string }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;

        const diagramId = payload.diagramId || this._getDiagramId();
        const command = new MoveNodesCommand(this._getInstanceId(), diagramId, payload.nodes, payload.engine);
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), diagramId).history.execute(command);
    }

    private _onNodeHidden(payload: { viewId?: string; notesJson?: any; hiddenNodeIds?: string[]; engine?: string }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        const engine = payload.engine || Renderer.getDefaultEngine();
        const command = new DeleteSelectionCommand(this._getInstanceId(), this._getDiagramId(), payload.notesJson || null, payload.hiddenNodeIds || [], engine);
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), this._getDiagramId()).history.execute(command);
    }

    private _onUndoRequest(payload: { viewId?: string }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        
        const history = DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), this._getDiagramId()).history;
        
        if (history.hasUndo()) {
            history.undo();
        } else {
            const dataModel = this._oView.getModel("diagramData") as JSONModel;
            const aLinks = dataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [];
            if (aLinks.length > 0) {
                const sParentName = aLinks[aLinks.length - 1].name;
                EventManager.getInstance().publish("diagram:nodeDrillDown", { viewName: sParentName });
            }
        }
    }

    private _onRedoRequest(payload: { viewId?: string }): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        DiagramStateStore.getInstance().getDiagramState(this._getInstanceId(), this._getDiagramId()).history.redo();
    }
}
