/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages the Hidden Nodes Dialog and List selections.
 * @description Extracted from CanvasActionHandler to enforce SRP.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import List from "sap/m/List";
import MessageToast from "sap/m/MessageToast";
import Context from "sap/ui/model/Context";
import Renderer from "../renderer/Renderer";
import { DomEvents } from "../constants/EventConstants";

export default class HiddenNodesHandler {
    private _oView: View;
    private _fnVisibilityChangedBind!: EventListener;
    private _bIsAttached: boolean = false;

    constructor(oView: View) {
        this._oView = oView;
    }

    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    public attachEvents(): void {
        if (this._bIsAttached) return;
        this._fnVisibilityChangedBind = this._onVisibilityChanged.bind(this) as EventListener;
        document.addEventListener(DomEvents.NODES_VISIBILITY_CHANGED, this._fnVisibilityChangedBind);
        this._bIsAttached = true;
    }

    public detachEvents(): void {
        if (!this._bIsAttached) return;
        document.removeEventListener(DomEvents.NODES_VISIBILITY_CHANGED, this._fnVisibilityChangedBind);
        this._bIsAttached = false;
    }

    public openDialog(): void {
        const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.open();
    }

    public closeDialog(): void {
        const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.close();
    }

    public showAll(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.showHiddenNodes(this._getInstanceId(), sEngine);
        (this._oView.getModel("view") as JSONModel).setProperty("/hasHiddenNodes", false);
        MessageToast.show("All hidden nodes restored");
        this.closeDialog();
        (this._oView.byId("listHiddenNodes") as List)?.removeSelections(true);
    }

    public restoreSelected(): void {
        const oList = this._oView.byId("listHiddenNodes") as List;
        if (!oList) return;
        
        const aSelectedContexts = oList.getSelectedContexts();
        if (aSelectedContexts.length === 0) {
            MessageToast.show("No entities selected");
            return;
        }
        
        const aIds = aSelectedContexts.map((oCtx: Context) => oCtx.getProperty("id"));
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        
        Renderer.showSpecificNodes(this._getInstanceId(), sEngine, aIds);
        oList.removeSelections(true);
        
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const aRemaining = oViewModel.getProperty("/hiddenNodesList") || [];
        if (aRemaining.length <= aIds.length) {
            this.closeDialog();
        }
    }

    /**
     * @private
     * @description Updates standard visual indicators dynamically based on node exposure changes.
     */
    private _onVisibilityChanged(oEvent: globalThis.Event): void {
        const oCustomEvent = oEvent as unknown as CustomEvent;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        const bHasHidden = oCustomEvent.detail?.hasHidden || false;
        const aHiddenNodes = oCustomEvent.detail?.hiddenNodes || [];
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/hasHiddenNodes", bHasHidden);
            oViewModel.setProperty("/hiddenNodesList", aHiddenNodes);
        }
    }
}