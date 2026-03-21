/**
 * @fileoverview Manages the UI lifecycle for saving, loading, and applying View Variants.
 * @version 1.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 * * DESIGN RATIONALE:
 * Extracts all variant persistence logic from the Main Controller. 
 * Handles programmatic dialog generation, local storage synchronization 
 * via the VariantManager utility, and deep object mapping for UI hydration.
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
import VariantManager from "../helpers/VariantManager";
import Event from "sap/ui/base/Event";

export default class VariantHandler {
    private _oView: View;
    private _fnGetText: (k: string, args?: any[]) => string;

    /**
     * Initializes the VariantHandler.
     * @param {View} oView - Reference to the main view to access controls and models.
     * @param {Function} fnGetText - Delegate function to safely retrieve i18n translations.
     */
    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._fnGetText = fnGetText;
    }

    /**
     * Hydrates persistent history and variant models from local storage on app load.
     * Binds them to named JSONModels so the UI dropdowns auto-populate.
     * @public
     */
    public loadHistoryAndVariants(): void {
        this._oView.setModel(new JSONModel({ items: VariantManager.getHistory() }), "history");
        this._oView.setModel(new JSONModel({ items: VariantManager.getVariants() }), "variants");
    }

    /**
     * Updates the search history persistence layer.
     * @param {string} sName - Target CDS object name to add to the recent history stack.
     * @public
     */
    public updateHistory(sName: string): void {
        const aHistory = VariantManager.updateHistory(sName);
        (this._oView.getModel("history") as JSONModel).setProperty("/items", aHistory);
    }

    /**
     * Initiates the Variant Save workflow by programmatically building an SAPUI5 Dialog.
     * @public
     */
    public openSaveDialog(): void {
        // Pre-fill the input with the currently selected variant name if one exists
        const sCurrentVariant = (this._oView.byId("selVariant") as Select).getSelectedKey() || "";
        const oInput = new Input({ value: sCurrentVariant, placeholder: this._fnGetText("phVariantName") });

        // Construct the Dialog control dynamically
        const oDialog = new Dialog({
            title: this._fnGetText("ttSaveVariant"),
            content: [oInput],
            beginButton: new Button({
                text: "Save",
                type: "Emphasized",
                press: () => this._handleSaveVariantDialogConfirm(oInput.getValue().trim(), oDialog)
            }),
            endButton: new Button({ text: "Cancel", press: () => oDialog.close() }),
            // Critical: Ensure the DOM is cleaned up to prevent memory leaks with duplicate IDs
            afterClose: () => oDialog.destroy()
        });

        oDialog.addStyleClass("sapUiContentPadding");
        
        // Attach to the view to inherit CSS classes (like cozy/compact) and i18n models
        this._oView.addDependent(oDialog);
        oDialog.open();
    }

    /**
     * Removes the currently selected variant from local persistence and updates the UI.
     * @public
     */
    public deleteSelected(): void {
        const sSelectedName = (this._oView.byId("selVariant") as Select).getSelectedKey();
        if (!sSelectedName) return;

        // Delete from local storage and update the bound model array
        const aVariants = VariantManager.deleteVariant(sSelectedName);
        (this._oView.getModel("variants") as JSONModel).setProperty("/items", aVariants);

        MessageToast.show(this._fnGetText("msgVariantDeleted", [sSelectedName]));
    }

    /**
     * Handles variant selection from the dropdown. 
     * Re-hydrates all UI state, layout logic, formatting objects, and token lists.
     * @param {Event} oEvent - Selection change event from the Variant Select control.
     * @public
     */
    public applyVariant(oEvent: Event): void {
        const sSelectedName = (oEvent.getSource() as Select).getSelectedKey();
        const oModel = this._oView.getModel("variants") as JSONModel;
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        
        // Retrieve the full variant configuration object
        const aVariants: any[] = oModel.getProperty("/items");
        const oVariant = aVariants.find(v => v.name === sSelectedName);

        if (oVariant) {
            // Restore standard primitive control values
            (this._oView.byId("cmbCdsName") as ComboBox).setValue(oVariant.cdsName || "");
            (this._oView.byId("selEngine") as Select).setSelectedKey(oVariant.engine);
            (this._oView.byId("stepMaxLevel") as StepInput).setValue(oVariant.maxLevel);
            (this._oView.byId("swKeys") as Switch).setState(oVariant.keys);
            (this._oView.byId("swFields") as Switch).setState(oVariant.fields);
            (this._oView.byId("swAssocFields") as Switch).setState(oVariant.assocFields);
            (this._oView.byId("swBase") as Switch).setState(oVariant.base);
            (this._oView.byId("swCustomOnly") as Switch).setState(oVariant.customOnly);
            
            // Restore Dynamic Formatting Objects to the JSONModel
            oUiModel.setProperty("/activeEngine", oVariant.engine || "PLANTUML");
            if (oVariant.formatPlantUML) oUiModel.setProperty("/formatPlantUML", oVariant.formatPlantUML);
            if (oVariant.formatGraphviz) oUiModel.setProperty("/formatGraphviz", oVariant.formatGraphviz);
            if (oVariant.formatMermaid) oUiModel.setProperty("/formatMermaid", oVariant.formatMermaid);

            // Restore Mutually Exclusive Relationship Mode UI
            const sMode = oVariant.relMode || "LINES";
            (this._oView.byId("segRelMode") as SegmentedButton).setSelectedKey(sMode);
            (this._oView.byId("boxLines") as VBox).setVisible(sMode === "LINES");
            (this._oView.byId("boxDiscovery") as VBox).setVisible(sMode !== "LINES");

            // Restore nested Toggle states using nullish coalescing (??) to prevent 
            // breaking changes if older variant versions are loaded
            (this._oView.byId("swDiscAssoc") as Switch).setState(oVariant.discAssoc ?? true);
            (this._oView.byId("swDiscComp") as Switch).setState(oVariant.discComp ?? true);
            (this._oView.byId("swDiscInherit") as Switch).setState(oVariant.discInherit ?? true);
            (this._oView.byId("swLineAssoc") as Switch).setState(oVariant.lineAssoc ?? true);
            (this._oView.byId("swLineComp") as Switch).setState(oVariant.lineComp ?? true);
            (this._oView.byId("swLineInherit") as Switch).setState(oVariant.lineInherit ?? true);
            
            // Re-build visual Token controls from saved comma-separated strings
            const oIncInput = this._oView.byId("inpInclude") as MultiInput;
            const oExcInput = this._oView.byId("inpExclude") as MultiInput;
            
            // Flush old tokens and recreate 'Include' list
            oIncInput.removeAllTokens();
            if (oVariant.includeCds) {
                oVariant.includeCds.split(",").forEach((s: string) => {
                    if (s.trim()) oIncInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
                });
            }

            // Flush old tokens and recreate 'Exclude' list
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
     * Validates the provided variant name and checks for existing overwrites.
     * Triggers an explicit confirmation prompt if the name already exists.
     * @param {string} sName - The name entered by the user in the dialog.
     * @param {Dialog} oDialog - Reference to the dialog to close upon success.
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
     * Executes the actual local storage save by capturing the current UI state.
     * @param {string} sName - Validated variant name.
     * @param {JSONModel} oModel - The UI model holding the variant list.
     * @private
     */
    private _executeVariantSave(sName: string, oModel: JSONModel): void {
        const oState = this._captureCurrentUiState(sName);
        const aVariants = VariantManager.saveVariant(oState);
        
        // Update the binding so the dropdown immediately reflects the new list
        oModel.setProperty("/items", aVariants);
        (this._oView.byId("selVariant") as Select).setSelectedKey(sName);

        MessageToast.show(this._fnGetText("msgVariantSaved", [sName]));
    }

    /**
     * Deep mapping function that serializes all physical UI control values, 
     * token lists, and dynamic JSON model properties into a standardized state object.
     * @param {string} sName - Name of the variant being saved.
     * @returns {any} A serialized representation of the view's current configuration.
     * @private
     */
    private _captureCurrentUiState(sName: string): any {
        // Extract plain text arrays from complex UI5 Token objects
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
            
            // RelMode controls which of the following two groups of toggles are active
            relMode: (this._oView.byId("segRelMode") as SegmentedButton).getSelectedKey(),
            discAssoc: (this._oView.byId("swDiscAssoc") as Switch).getState(),
            discComp: (this._oView.byId("swDiscComp") as Switch).getState(),
            discInherit: (this._oView.byId("swDiscInherit") as Switch).getState(),
            lineAssoc: (this._oView.byId("swLineAssoc") as Switch).getState(),
            lineComp: (this._oView.byId("swLineComp") as Switch).getState(),
            lineInherit: (this._oView.byId("swLineInherit") as Switch).getState(),
            
            // Re-serialize tokens into comma-separated strings for easy storage
            includeCds: aIncTokens.map(t => t.getText()).join(","),
            excludeCds: aExcTokens.map(t => t.getText()).join(","),
            
            // Persist the specific formatting options bound to the UI model
            formatPlantUML: oUiModel.getProperty("/formatPlantUML"),
            formatGraphviz: oUiModel.getProperty("/formatGraphviz"),
            formatMermaid: oUiModel.getProperty("/formatMermaid")
        };
    }
}