/**
 * @fileoverview Manages the UI lifecycle for saving, loading, and applying View Variants.
 * @version 1.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import Select from "sap/m/Select";
import ComboBox from "sap/m/ComboBox";
import StepInput from "sap/m/StepInput";
import Switch from "sap/m/Switch";
import SegmentedButton from "sap/m/SegmentedButton";
import VBox from "sap/m/VBox";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import VariantManager from "../util/VariantManager";
import Event from "sap/ui/base/Event";

export default class VariantHandler {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;

    /**
     * @param {View} oView - Reference to the main view.
     * @param {Function} fnGetText - i18n translation delegate.
     */
    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._fnGetText = fnGetText;
    }

    /**
     * Hydrates persistent history and variant models from storage.
     * @public
     */
    public loadHistoryAndVariants(): void {
        this._oView.setModel(new JSONModel({ items: VariantManager.getHistory() }), "history");
        this._oView.setModel(new JSONModel({ items: VariantManager.getVariants() }), "variants");
    }

    /**
     * Updates the search history persistence layer.
     * @param {string} sName - Target CDS to save to history.
     * @public
     */
    public updateHistory(sName: string): void {
        const aHistory = VariantManager.updateHistory(sName);
        (this._oView.getModel("history") as JSONModel).setProperty("/items", aHistory);
    }

    /**
     * Initiates the Variant Save workflow via dialog.
     * @public
     */
    public openSaveDialog(): void {
        const sCurrentVariant = (this._oView.byId("selVariant") as Select).getSelectedKey() || "";
        const oInput = new Input({ value: sCurrentVariant, placeholder: this._fnGetText("phVariantName") });

        const oDialog = new Dialog({
            title: this._fnGetText("ttSaveVariant"),
            content: [oInput],
            beginButton: new Button({
                text: "Save",
                type: "Emphasized",
                press: () => this._handleSaveVariantDialogConfirm(oInput.getValue().trim(), oDialog)
            }),
            endButton: new Button({ text: "Cancel", press: () => oDialog.close() }),
            afterClose: () => oDialog.destroy()
        });

        oDialog.addStyleClass("sapUiContentPadding");
        this._oView.addDependent(oDialog);
        oDialog.open();
    }

    /**
     * Removes a variant from local persistence.
     * @public
     */
    public deleteSelected(): void {
        const sSelectedName = (this._oView.byId("selVariant") as Select).getSelectedKey();
        if (!sSelectedName) return;

        const aVariants = VariantManager.deleteVariant(sSelectedName);
        (this._oView.getModel("variants") as JSONModel).setProperty("/items", aVariants);

        MessageToast.show(this._fnGetText("msgVariantDeleted", [sSelectedName]));
    }

    /**
     * Handles variant selection. Re-hydrates UI state, formats, and token lists.
     * @param {Event} oEvent - Selection event.
     * @public
     */
    public applyVariant(oEvent: Event): void {
        const sSelectedName = (oEvent.getSource() as Select).getSelectedKey();
        const oModel = this._oView.getModel("variants") as JSONModel;
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const aVariants: any[] = oModel.getProperty("/items");
        const oVariant = aVariants.find(v => v.name === sSelectedName);

        if (oVariant) {
            (this._oView.byId("cmbCdsName") as ComboBox).setValue(oVariant.cdsName || "");
            (this._oView.byId("selEngine") as Select).setSelectedKey(oVariant.engine);
            (this._oView.byId("stepMaxLevel") as StepInput).setValue(oVariant.maxLevel);
            (this._oView.byId("swKeys") as Switch).setState(oVariant.keys);
            (this._oView.byId("swFields") as Switch).setState(oVariant.fields);
            (this._oView.byId("swAssocFields") as Switch).setState(oVariant.assocFields);
            (this._oView.byId("swBase") as Switch).setState(oVariant.base);
            (this._oView.byId("swCustomOnly") as Switch).setState(oVariant.customOnly);
            
            oUiModel.setProperty("/activeEngine", oVariant.engine || "PLANTUML");
            if (oVariant.formatPlantUML) oUiModel.setProperty("/formatPlantUML", oVariant.formatPlantUML);
            if (oVariant.formatGraphviz) oUiModel.setProperty("/formatGraphviz", oVariant.formatGraphviz);
            if (oVariant.formatMermaid) oUiModel.setProperty("/formatMermaid", oVariant.formatMermaid);

            const sMode = oVariant.relMode || "LINES";
            (this._oView.byId("segRelMode") as SegmentedButton).setSelectedKey(sMode);
            (this._oView.byId("boxLines") as VBox).setVisible(sMode === "LINES");
            (this._oView.byId("boxDiscovery") as VBox).setVisible(sMode !== "LINES");

            (this._oView.byId("swDiscAssoc") as Switch).setState(oVariant.discAssoc ?? true);
            (this._oView.byId("swDiscComp") as Switch).setState(oVariant.discComp ?? true);
            (this._oView.byId("swDiscInherit") as Switch).setState(oVariant.discInherit ?? true);
            (this._oView.byId("swLineAssoc") as Switch).setState(oVariant.lineAssoc ?? true);
            (this._oView.byId("swLineComp") as Switch).setState(oVariant.lineComp ?? true);
            (this._oView.byId("swLineInherit") as Switch).setState(oVariant.lineInherit ?? true);
            
            const oIncInput = this._oView.byId("inpInclude") as MultiInput;
            const oExcInput = this._oView.byId("inpExclude") as MultiInput;
            
            oIncInput.removeAllTokens();
            if (oVariant.includeCds) {
                oVariant.includeCds.split(",").forEach((s: string) => {
                    if (s.trim()) oIncInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
                });
            }

            oExcInput.removeAllTokens();
            if (oVariant.excludeCds) {
                oVariant.excludeCds.split(",").forEach((s: string) => {
                    if (s.trim()) oExcInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
                });
            }

            MessageToast.show(this._fnGetText("msgVariantApplied", [oVariant.name]));
        }
    }

    /**
     * Validates name and checks for existing variants before executing save.
     * @private
     */
    private _handleSaveVariantDialogConfirm(sName: string, oDialog: Dialog): void {
        if (!sName) {
            MessageToast.show(this._fnGetText("msgEnterName"));
            return;
        }

        const oModel = this._oView.getModel("variants") as JSONModel;
        const bExists = oModel.getProperty("/items").some((v: any) => v.name === sName);

        if (bExists) {
            MessageBox.confirm(
                this._fnGetText("msgOverwriteText", [sName]),
                {
                    title: this._fnGetText("msgOverwriteTitle"),
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: (sAction: string) => {
                        if (sAction === MessageBox.Action.YES) {
                            this._executeVariantSave(sName, oModel);
                            oDialog.close();
                        }
                    }
                }
            );
        } else {
            this._executeVariantSave(sName, oModel);
            oDialog.close();
        }
    }

    /**
     * Serializes UI state and persists to local storage.
     * @private
     */
    private _executeVariantSave(sName: string, oModel: JSONModel): void {
        const oState = this._captureCurrentUiState(sName);
        const aVariants = VariantManager.saveVariant(oState);
        
        oModel.setProperty("/items", aVariants);
        (this._oView.byId("selVariant") as Select).setSelectedKey(sName);

        MessageToast.show(this._fnGetText("msgVariantSaved", [sName]));
    }

    /**
     * Maps all UI control values, including dynamic JSON formats, into a standardized state object.
     * @private
     */
    private _captureCurrentUiState(sName: string): any {
        const aIncTokens = (this._oView.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (this._oView.byId("inpExclude") as MultiInput).getTokens();
        const oUiModel = this._oView.getModel("ui") as JSONModel;

        return {
            name: sName,
            cdsName: (this._oView.byId("cmbCdsName") as ComboBox).getValue().trim(),
            engine: (this._oView.byId("selEngine") as Select).getSelectedKey(),
            maxLevel: (this._oView.byId("stepMaxLevel") as StepInput).getValue(),
            keys: (this._oView.byId("swKeys") as Switch).getState(),
            fields: (this._oView.byId("swFields") as Switch).getState(),
            assocFields: (this._oView.byId("swAssocFields") as Switch).getState(),
            base: (this._oView.byId("swBase") as Switch).getState(),
            customOnly: (this._oView.byId("swCustomOnly") as Switch).getState(),
            relMode: (this._oView.byId("segRelMode") as SegmentedButton).getSelectedKey(),
            discAssoc: (this._oView.byId("swDiscAssoc") as Switch).getState(),
            discComp: (this._oView.byId("swDiscComp") as Switch).getState(),
            discInherit: (this._oView.byId("swDiscInherit") as Switch).getState(),
            lineAssoc: (this._oView.byId("swLineAssoc") as Switch).getState(),
            lineComp: (this._oView.byId("swLineComp") as Switch).getState(),
            lineInherit: (this._oView.byId("swLineInherit") as Switch).getState(),
            includeCds: aIncTokens.map(t => t.getText()).join(","),
            excludeCds: aExcTokens.map(t => t.getText()).join(","),
            
            // Persist the specific formatting options
            formatPlantUML: oUiModel.getProperty("/formatPlantUML"),
            formatGraphviz: oUiModel.getProperty("/formatGraphviz"),
            formatMermaid: oUiModel.getProperty("/formatMermaid")
        };
    }
}