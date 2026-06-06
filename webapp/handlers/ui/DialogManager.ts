/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers.ui
 * @fileoverview Universal Dialog & Popover Lifecycle Manager
 * @description Manages XML Fragment instantiation, dynamic TypeScript Dialog creation, 
 * view dependency injection, and safe destruction to prevent UI5 memory leaks.
 */

import View from "sap/ui/core/mvc/View";
import Dialog from "sap/m/Dialog";
import TextArea from "sap/m/TextArea";
import Button from "sap/m/Button";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import { EventManager } from "../../events/EventManager";
import Renderer from "../../renderer/Renderer";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import List from "sap/m/List";
import Context from "sap/ui/model/Context";
import { DiagramData, ViewState } from "../../constants/StateConstants";

export default class DialogManager {
    private static _mViews: Map<string, View> = new Map();
    private static _subscriptions: any[] = [];
    private static _bIsAttached: boolean = false;

    /**
     * @public
     * @static
     * @description Bootstraps the Dialog Manager with the active view.
     */
    public static bootstrap(sViewId: string, oView: View): void {
        this._mViews.set(sViewId, oView);
        this.attachEvents();
    }

    /**
     * @public
     * @static
     * @description Attaches event listeners for cross-component dialog requests.
     */
    public static attachEvents(): void {
        if (this._bIsAttached) return;

        this._subscriptions = [
            EventManager.getInstance().subscribe("ui:openDialog", (e: any) => this._handleOpenDialog(e)),
            EventManager.getInstance().subscribe("ui:closeDialog", (e: any) => this._handleCloseDialog(e)),
            EventManager.getInstance().subscribe("ui:restoreSelectedNodes", (e: any) => this._handleRestoreSelected(e)),
            EventManager.getInstance().subscribe("ui:showAllHiddenNodes", (e: any) => this._handleShowAllHidden(e)),
            EventManager.getInstance().subscribe("canvas:nodesVisibilityChanged", (e: any) => this._onVisibilityChanged(e)),
            EventManager.getInstance().subscribe("canvas:promptAddNoteRequest", (e: any) => this.promptAddNote(e)),
            EventManager.getInstance().subscribe("canvas:promptEditNoteRequest", (e: any) => this.promptEditNote(e))
        ];

        this._bIsAttached = true;
    }

    /**
     * @public
     * @static
     * @description Destroys all cached dialogs and detaches events.
     * Wait, since this is called by ToolboxManager.destroy(), we should ideally pass viewId.
     * But since destroy() doesn't take viewId right now, let's add it. Wait, ToolboxManager.destroy() was already updated to not call DialogManager.destroy() unless it's the last view.
     * Actually, let's just make a clear method for the specific view.
     */
    public static destroy(sViewId?: string): void {
        if (sViewId) {
            this._mViews.delete(sViewId);
        }
        
        if (!sViewId || this._mViews.size === 0) {
            if (!this._bIsAttached) return;
            this._bIsAttached = false;
            this._subscriptions.forEach((sub: any) => sub.dispose());
            this._subscriptions = [];
            this._mViews.clear();
        }
    }

    // ========================================================================
    // DIALOG ROUTER
    // ========================================================================

    private static _handleOpenDialog(payload: any): void {
        const sViewId = payload?.viewId;
        if (!sViewId || !this._mViews.has(sViewId)) return;
        if (payload.dialogType === "HiddenNodes") this._openHiddenNodesDialog(sViewId);
    }

    private static _handleCloseDialog(payload: any): void {
        const sViewId = payload?.viewId;
        if (!sViewId || !this._mViews.has(sViewId)) return;
        if (payload.dialogType === "HiddenNodes") {
            const oView = this._mViews.get(sViewId);
            const dialog = oView?.byId("popHiddenNodes") as Dialog;
            if (dialog) dialog.close();
        }
    }

    // ========================================================================
    // HIDDEN NODES LOGIC
    // ========================================================================

    private static _openHiddenNodesDialog(sViewId: string): void {
        const oView = this._mViews.get(sViewId);
        if (!oView) return;
        const dialog = oView.byId("popHiddenNodes") as Dialog;
        if (dialog) dialog.open();
    }

    private static _handleShowAllHidden(payload: any): void {
        const sViewId = payload?.viewId;
        const oView = this._mViews.get(sViewId);
        if (!oView) return;
        
        const sEngine = (oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.showHiddenNodes(sViewId, sEngine);
        (oView.getModel("view") as JSONModel).setProperty(ViewState.HAS_HIDDEN_NODES, false);
        MessageToast.show("All hidden nodes restored");
        
        const dialog = oView.byId("popHiddenNodes") as Dialog;
        if (dialog) dialog.close();
        
        (oView.byId("listHiddenNodes") as List)?.removeSelections(true);
    }

    private static _handleRestoreSelected(payload: any): void {
        const sViewId = payload?.viewId;
        const oView = this._mViews.get(sViewId);
        if (!oView) return;
        
        const oList = oView.byId("listHiddenNodes") as List;
        if (!oList) return;
        
        const aSelectedContexts = oList.getSelectedContexts();
        if (aSelectedContexts.length === 0) {
            MessageToast.show("No entities selected");
            return;
        }
        
        const aIds = aSelectedContexts.map((oCtx: Context) => oCtx.getProperty("id"));
        const sEngine = (oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        
        Renderer.showSpecificNodes(sViewId, sEngine, aIds);
        oList.removeSelections(true);
        
        const oViewModel = oView.getModel("view") as JSONModel;
        const aRemaining = oViewModel.getProperty(ViewState.HIDDEN_NODES_LIST) || [];
        if (aRemaining.length <= aIds.length) {
            const dialog = oView.byId("popHiddenNodes") as Dialog;
            if (dialog) dialog.close();
        }
    }

    private static _onVisibilityChanged(payload: any): void {
        const sViewId = payload?.viewId;
        const oView = this._mViews.get(sViewId);
        if (!oView) return;
        
        const bHasHidden = payload?.hasHidden || false;
        const aHiddenNodes = payload?.hiddenNodes || [];
        const oViewModel = oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty(ViewState.HAS_HIDDEN_NODES, bHasHidden);
            oViewModel.setProperty(ViewState.HIDDEN_NODES_LIST, aHiddenNodes);
        }
    }

    // ========================================================================
    // STICKY NOTES LOGIC (DYNAMIC TS DIALOGS)
    // ========================================================================

    public static promptAddNote(payload: any): void {
        const sViewId = payload?.viewId;
        if (!sViewId) return;
        
        this._openNoteDialog(sViewId, "Add Sticky Note", "", "Marker", (sText, sFont) => {
            EventManager.getInstance().publish("canvas:addNoteRequest", { viewId: sViewId, text: sText, fontFamily: sFont });
        });
    }

    public static promptEditNote(payload: any): void {
        const sViewId = payload?.viewId;
        if (!sViewId) return;
        
        const sId = payload?.noteId || payload?.id;
        const sCurrentText = payload?.text || "";
        const sCurrentFont = payload?.fontFamily || "Marker";
        
        this._openNoteDialog(sViewId, "Edit Sticky Note", sCurrentText, sCurrentFont, (sText, sFont) => {
            EventManager.getInstance().publish("canvas:editNoteRequest", { viewId: sViewId, noteId: sId, text: sText, fontFamily: sFont });
        });
    }

    private static _openNoteDialog(sViewId: string, sTitle: string, sInitialText: string, sInitialFont: string, fnOnSave: (sText: string, sFont: string) => void): void {
        const oView = this._mViews.get(sViewId);
        if (!oView) return;

        const oTextArea = new TextArea({ width: "100%", rows: 5, value: sInitialText, placeholder: "Type your sticky note here..." });
        
        const oFontSelect = new Select({
            width: "100%",
            selectedKey: sInitialFont || "Marker",
            items: [
                new Item({ key: "Marker", text: "Marker (Handwritten)" }),
                new Item({ key: "Standard", text: "Standard (Sans-Serif)" }),
                new Item({ key: "Monospace", text: "Monospace (Code)" }),
                new Item({ key: "Serif", text: "Serif (Formal)" })
            ]
        });

        const oContent = new VBox({
            items: [ new Label({ text: "Note Text" }), oTextArea, new Label({ text: "Typography" }).addStyleClass("sapUiSmallMarginTop"), oFontSelect ]
        }).addStyleClass("sapUiTinyMargin");

        const oDialog = new Dialog({
            title: sTitle,
            contentWidth: "300px",
            content: [oContent],
            beginButton: new Button({
                text: "Save",
                type: "Emphasized",
                press: () => {
                    const sText = oTextArea.getValue().trim();
                    if (sText) fnOnSave(sText, oFontSelect.getSelectedKey());
                    oDialog.close();
                }
            }),
            endButton: new Button({ text: "Cancel", press: () => oDialog.close() }),
            afterClose: () => oDialog.destroy()
        });
        
        oView.addDependent(oDialog);
        oDialog.open();
    }
}
