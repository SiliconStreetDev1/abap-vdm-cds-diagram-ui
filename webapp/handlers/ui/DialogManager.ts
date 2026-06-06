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
    private static _oView: View | null = null;
    private static _oHiddenNodesDialog: Dialog | null = null;
    private static _subscriptions: any[] = [];
    private static _bIsAttached: boolean = false;

    /**
     * @public
     * @static
     * @description Bootstraps the Dialog Manager with the active view.
     */
    public static bootstrap(oView: View): void {
        this._oView = oView;
        this.attachEvents();
    }

    private static _getInstanceId(): string {
        return this._oView?.getController()?.getOwnerComponent()?.getId() || this._oView?.getId() || "";
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
            EventManager.getInstance().subscribe("canvas:promptAddNoteRequest", (e: any) => this.promptAddNote()),
            EventManager.getInstance().subscribe("canvas:promptEditNoteRequest", (e: any) => this.promptEditNote(e))
        ];

        this._bIsAttached = true;
    }

    /**
     * @public
     * @static
     * @description Destroys all cached dialogs and detaches events.
     */
    public static destroy(): void {
        if (!this._bIsAttached) return;
        this._bIsAttached = false;
        this._subscriptions = [];
        this._oView = null;
        this._oHiddenNodesDialog = null;
    }

    // ========================================================================
    // DIALOG ROUTER
    // ========================================================================

    private static _handleOpenDialog(payload: any): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        if (payload.dialogType === "HiddenNodes") this._openHiddenNodesDialog();
    }

    private static _handleCloseDialog(payload: any): void {
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        if (payload.dialogType === "HiddenNodes" && this._oHiddenNodesDialog) {
            this._oHiddenNodesDialog.close();
        }
    }

    // ========================================================================
    // HIDDEN NODES LOGIC
    // ========================================================================

    private static _openHiddenNodesDialog(): void {
        if (!this._oView) return;
        this._oHiddenNodesDialog = this._oView.byId("popHiddenNodes") as Dialog;
        if (this._oHiddenNodesDialog) this._oHiddenNodesDialog.open();
    }

    private static _handleShowAllHidden(payload: any): void {
        if (!this._oView) return;
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.showHiddenNodes(this._getInstanceId(), sEngine);
        (this._oView.getModel("view") as JSONModel).setProperty(ViewState.HAS_HIDDEN_NODES, false);
        MessageToast.show("All hidden nodes restored");
        if (this._oHiddenNodesDialog) this._oHiddenNodesDialog.close();
        (this._oView.byId("listHiddenNodes") as List)?.removeSelections(true);
    }

    private static _handleRestoreSelected(payload: any): void {
        if (!this._oView) return;
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
            if (this._oHiddenNodesDialog) this._oHiddenNodesDialog.close();
        }
    }

    private static _onVisibilityChanged(oEvent: any): void {
        if (!this._oView) return;
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

    // ========================================================================
    // STICKY NOTES LOGIC (DYNAMIC TS DIALOGS)
    // ========================================================================

    public static promptAddNote(): void {
        this._openNoteDialog("Add Sticky Note", "", "Marker", (sText, sFont) => {
            EventManager.getInstance().publish("canvas:addNoteRequest", { viewId: this._getInstanceId(), text: sText, fontFamily: sFont });
        });
    }

    public static promptEditNote(payload: any): void {
        const sId = payload?.noteId || payload?.id;
        const sCurrentText = payload?.text || "";
        const sCurrentFont = payload?.fontFamily || "Marker";
        
        this._openNoteDialog("Edit Sticky Note", sCurrentText, sCurrentFont, (sText, sFont) => {
            EventManager.getInstance().publish("canvas:editNoteRequest", { viewId: this._getInstanceId(), noteId: sId, text: sText, fontFamily: sFont });
        });
    }

    private static _openNoteDialog(sTitle: string, sInitialText: string, sInitialFont: string, fnOnSave: (sText: string, sFont: string) => void): void {
        if (!this._oView) return;

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
        
        this._oView.addDependent(oDialog);
        oDialog.open();
    }
}
