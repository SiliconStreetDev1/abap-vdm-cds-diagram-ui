/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages the Hidden Nodes Dialog and List selections.
 * @description Extracted from CanvasActionHandler to enforce SRP.
 */
import { EventManager } from "../../events/EventManager";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import List from "sap/m/List";
import MessageToast from "sap/m/MessageToast";
import Context from "sap/ui/model/Context";
import Renderer from "../../renderer/Renderer";
import { ViewState, DiagramData } from "../../constants/StateConstants";

export default class HiddenNodesHandler {
    private _oView: View;
    private _fnVisibilityChangedBind!: any;
    private _bIsAttached: boolean = false;
    private _subscriptions: any[] = [];

    /**
     * @constructor
     * @param {View} oView - Reference to the active UI5 view.
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
     * @public
     * @description Attaches custom DOM event listeners to monitor node visibility changes triggered by engine physics.
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;
        this._fnVisibilityChangedBind = this._onVisibilityChanged.bind(this) as any;
        this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodesVisibilityChanged", this._fnVisibilityChangedBind));
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches custom DOM event listeners to prevent memory leaks.
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;
        /* removed */
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Opens the dialog displaying the list of all currently hidden entities.
     */
    public openDialog(): void {
        const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.open();
    }

    /**
     * @public
     * @description Closes the hidden entities dialog.
     */
    public closeDialog(): void {
        const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.close();
    }

    /**
     * @public
     * @description Restores all currently hidden entities back to the visible diagram canvas and forces a layout refresh.
     */
    public showAll(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.showHiddenNodes(this._getInstanceId(), sEngine);
        (this._oView.getModel("view") as JSONModel).setProperty(ViewState.HAS_HIDDEN_NODES, false);
        MessageToast.show("All hidden nodes restored");
        this.closeDialog();
        (this._oView.byId("listHiddenNodes") as List)?.removeSelections(true);
    }

    /**
     * @public
     * @description Restores only the specific entities selected in the dialog list back to the canvas.
     */
    public restoreSelected(): void {
        const oList = this._oView.byId("listHiddenNodes") as List;
        if (!oList) return;
        
        const aSelectedContexts = oList.getSelectedContexts();
        if (aSelectedContexts.length === 0) {
            MessageToast.show("No entities selected");
            return;
        }
        
        const aIds = aSelectedContexts.map((oCtx: Context) => oCtx.getProperty("id"));
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        
        Renderer.showSpecificNodes(this._getInstanceId(), sEngine, aIds);
        oList.removeSelections(true);
        
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const aRemaining = oViewModel.getProperty(ViewState.HIDDEN_NODES_LIST) || [];
        if (aRemaining.length <= aIds.length) {
            this.closeDialog();
        }
    }

    /**
     * @private
     * @description Updates standard visual indicators dynamically based on node exposure changes.
     */
    private _onVisibilityChanged(oEvent: globalThis.Event): void {
        const payload = oEvent as any;
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        const bHasHidden = payload?.hasHidden || false;
        const aHiddenNodes = payload?.hiddenNodes || [];
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty(ViewState.HAS_HIDDEN_NODES, bHasHidden);
            oViewModel.setProperty(ViewState.HIDDEN_NODES_LIST, aHiddenNodes);
        }
    }
}