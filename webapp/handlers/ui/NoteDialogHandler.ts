/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates UI5 Dialog interactions for sticky notes.
 * @description Extracts Note Dialog UI generation from the CanvasActionHandler 
 * to strictly enforce the Single Responsibility Principle.
 */
import View from "sap/ui/core/mvc/View";
import Dialog from "sap/m/Dialog";
import TextArea from "sap/m/TextArea";
import Button from "sap/m/Button";
import Select from "sap/m/Select";
import Item from "sap/ui/core/Item";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import { DomEvents } from "../../constants/EventConstants";

export default class NoteDialogHandler {
    private _oView: View;
    private _fnPromptAddNoteBind!: EventListener;
    private _fnPromptEditNoteBind!: EventListener;
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
     * @public
     * @description Attaches custom DOM event listeners for note dialog requests.
     * @returns {void}
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;
        
        this._fnPromptAddNoteBind = ((oEvent: Event) => {
            if ((oEvent as CustomEvent<{ viewId: string }>).detail?.viewId && (oEvent as CustomEvent<{ viewId: string }>).detail?.viewId !== this._getInstanceId()) return;
            this.promptAddNote();
        }) as EventListener;
        
        this._fnPromptEditNoteBind = ((oEvent: Event) => {
            if ((oEvent as CustomEvent<{ viewId: string }>).detail?.viewId && (oEvent as CustomEvent<{ viewId: string }>).detail?.viewId !== this._getInstanceId()) return;
            this.promptEditNote(oEvent);
        }) as EventListener;

        if (typeof document !== "undefined") {
            document.addEventListener(DomEvents.PROMPT_ADD_NOTE_REQUEST, this._fnPromptAddNoteBind);
            document.addEventListener(DomEvents.PROMPT_EDIT_NOTE_REQUEST, this._fnPromptEditNoteBind);
        }
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches custom DOM event listeners to prevent memory leaks.
     * @returns {void}
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;
        if (typeof document !== "undefined") {
            document.removeEventListener(DomEvents.PROMPT_ADD_NOTE_REQUEST, this._fnPromptAddNoteBind);
            document.removeEventListener(DomEvents.PROMPT_EDIT_NOTE_REQUEST, this._fnPromptEditNoteBind);
        }
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Spawns a dialog for the user to type a new annotation.
     * @returns {void}
     */
    public promptAddNote(): void {
        this._openNoteDialog("Add Sticky Note", "", "Marker", (sText, sFont) => {
            if (typeof document !== "undefined") {
                document.dispatchEvent(new CustomEvent(DomEvents.ADD_NOTE_REQUEST, { detail: { viewId: this._getInstanceId(), text: sText, fontFamily: sFont } }));
            }
        });
    }

    /**
     * @public
     * @description Spawns a dialog for the user to edit an existing annotation.
     * @param {Event} oEvent - Event containing the node ID and current text.
     * @returns {void}
     */
    public promptEditNote(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent<{ id: string, text: string, fontFamily: string }>;
        const sId = oCustomEvent.detail?.id;
        const sCurrentText = oCustomEvent.detail?.text || "";
        const sCurrentFont = oCustomEvent.detail?.fontFamily || "Marker";
        
        this._openNoteDialog("Edit Sticky Note", sCurrentText, sCurrentFont, (sText, sFont) => {
            if (typeof document !== "undefined") {
                document.dispatchEvent(new CustomEvent(DomEvents.EDIT_NOTE_REQUEST, { detail: { viewId: this._getInstanceId(), id: sId, text: sText, fontFamily: sFont } }));
            }
        });
    }

    /**
     * @private
     * @description Reusable factory for creating note dialogs to eliminate code duplication.
     */
    private _openNoteDialog(sTitle: string, sInitialText: string, sInitialFont: string, fnOnSave: (sText: string, sFont: string) => void): void {
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
