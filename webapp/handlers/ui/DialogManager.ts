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
    private static _subscriptions: { dispose: () => void }[] = [];
    private static _bIsAttached: boolean = false;

    /**
     * @public
     * @static
     * @description Bootstraps the Dialog Manager with the active view.
     */
    public static bootstrap(viewId: string, activeView: View): void {
        this._mViews.set(viewId, activeView);
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
            EventManager.getInstance().subscribe("ui:openDialog", (e: any) => this._handleOpenDialog(e), { attachEventOnce: () => {} }),
            EventManager.getInstance().subscribe("ui:closeDialog", (e: any) => this._handleCloseDialog(e), { attachEventOnce: () => {} }),
            EventManager.getInstance().subscribe("ui:restoreSelectedNodes", (e: any) => this._handleRestoreSelected(e), { attachEventOnce: () => {} }),
            EventManager.getInstance().subscribe("ui:showAllHiddenNodes", (e: any) => this._handleShowAllHidden(e), { attachEventOnce: () => {} }),
            EventManager.getInstance().subscribe("canvas:nodesVisibilityChanged", (e: any) => this._onVisibilityChanged(e), { attachEventOnce: () => {} }),
            EventManager.getInstance().subscribe("canvas:promptAddNoteRequest", (e: any) => this.promptAddNote(e), { attachEventOnce: () => {} }),
            EventManager.getInstance().subscribe("canvas:promptEditNoteRequest", (e: any) => this.promptEditNote(e), { attachEventOnce: () => {} })
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
    public static destroy(viewId?: string): void {
        if (viewId) {
            this._mViews.delete(viewId);
        }
        
        if (!viewId || this._mViews.size === 0) {
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
        const viewId = payload?.viewId;
        if (!viewId || !this._mViews.has(viewId)) return;
        if (payload.dialogType === "HiddenNodes") this._openHiddenNodesDialog(viewId);
    }

    private static _handleCloseDialog(payload: any): void {
        const viewId = payload?.viewId;
        if (!viewId || !this._mViews.has(viewId)) return;
        if (payload.dialogType === "HiddenNodes") {
            const activeView = this._mViews.get(viewId);
            const dialog = activeView?.byId("popHiddenNodes") as Dialog;
            if (dialog) dialog.close();
        }
    }

    // ========================================================================
    // HIDDEN NODES LOGIC
    // ========================================================================

    private static _openHiddenNodesDialog(viewId: string): void {
        const activeView = this._mViews.get(viewId);
        if (!activeView) return;
        const dialog = activeView.byId("popHiddenNodes") as Dialog;
        if (dialog) dialog.open();
    }

    private static _handleShowAllHidden(payload: any): void {
        const viewId = payload?.viewId;
        const activeView = this._mViews.get(viewId);
        if (!activeView) return;
        
        const engineId = (activeView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.showHiddenNodes(viewId, engineId);
        (activeView.getModel("view") as JSONModel).setProperty(ViewState.HAS_HIDDEN_NODES, false);
        MessageToast.show("All hidden nodes restored");
        
        const dialog = activeView.byId("popHiddenNodes") as Dialog;
        if (dialog) dialog.close();
        
        (activeView.byId("listHiddenNodes") as List)?.removeSelections(true);
    }

    private static _handleRestoreSelected(payload: any): void {
        const viewId = payload?.viewId;
        const activeView = this._mViews.get(viewId);
        if (!activeView) return;
        
        const list = activeView.byId("listHiddenNodes") as List;
        if (!list) return;
        
        const selectedContexts = list.getSelectedContexts();
        if (selectedContexts.length === 0) {
            MessageToast.show("No entities selected");
            return;
        }
        
        const ids = selectedContexts.map((ctx: Context) => ctx.getProperty("id"));
        const engineId = (activeView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        
        Renderer.showSpecificNodes(viewId, engineId, ids);
        list.removeSelections(true);
        
        const viewModel = activeView.getModel("view") as JSONModel;
        const remaining = viewModel.getProperty(ViewState.HIDDEN_NODES_LIST) || [];
        if (remaining.length <= ids.length) {
            const dialog = activeView.byId("popHiddenNodes") as Dialog;
            if (dialog) dialog.close();
        }
    }

    private static _onVisibilityChanged(payload: any): void {
        const viewId = payload?.viewId;
        const activeView = this._mViews.get(viewId);
        if (!activeView) return;
        
        const hasHidden = payload?.hasHidden || false;
        const hiddenNodes = payload?.hiddenNodes || [];
        const viewModel = activeView.getModel("view") as JSONModel;
        if (viewModel) {
            viewModel.setProperty(ViewState.HAS_HIDDEN_NODES, hasHidden);
            viewModel.setProperty(ViewState.HIDDEN_NODES_LIST, hiddenNodes);
        }
    }

    // ========================================================================
    // STICKY NOTES LOGIC (DYNAMIC TS DIALOGS)
    // ========================================================================

    public static promptAddNote(payload: any): void {
        const viewId = payload?.viewId;
        if (!viewId) return;
        
        this._openNoteDialog(viewId, "Add Sticky Note", "", "Marker", (sText, sFont) => {
            EventManager.getInstance().publish("canvas:addNoteRequest", { viewId: viewId, text: sText, fontFamily: sFont });
        });
    }

    public static promptEditNote(payload: any): void {
        const viewId = payload?.viewId;
        if (!viewId) return;
        
        const sId = payload?.noteId || payload?.id;
        const sCurrentText = payload?.text || "";
        const sCurrentFont = payload?.fontFamily || "Marker";
        
        this._openNoteDialog(viewId, "Edit Sticky Note", sCurrentText, sCurrentFont, (sText, sFont) => {
            EventManager.getInstance().publish("canvas:editNoteRequest", { viewId: viewId, noteId: sId, text: sText, fontFamily: sFont });
        });
    }

    private static _openNoteDialog(viewId: string, title: string, initialText: string, initialFont: string, onSave: (text: string, font: string) => void): void {
        const activeView = this._mViews.get(viewId);
        if (!activeView) return;

        const textArea = new TextArea({ width: "100%", rows: 5, value: initialText, placeholder: "Type your sticky note here..." });
        
        const fontSelect = new Select({
            width: "100%",
            selectedKey: initialFont || "Marker",
            items: [
                new Item({ key: "Marker", text: "Marker (Handwritten)" }),
                new Item({ key: "Standard", text: "Standard (Sans-Serif)" }),
                new Item({ key: "Monospace", text: "Monospace (Code)" }),
                new Item({ key: "Serif", text: "Serif (Formal)" })
            ]
        });

        const content = new VBox({
            items: [ new Label({ text: "Note Text" }), textArea, new Label({ text: "Typography" }).addStyleClass("sapUiSmallMarginTop"), fontSelect ]
        }).addStyleClass("sapUiTinyMargin");

        const dialog = new Dialog({
            title: title,
            contentWidth: "300px",
            content: [content],
            beginButton: new Button({
                text: "Save",
                type: "Emphasized",
                press: () => {
                    const text = textArea.getValue().trim();
                    if (text) onSave(text, fontSelect.getSelectedKey());
                    dialog.close();
                }
            }),
            endButton: new Button({ text: "Cancel", press: () => dialog.close() }),
            afterClose: () => dialog.destroy()
        });
        
        activeView.addDependent(dialog);
        dialog.open();
    }
}
