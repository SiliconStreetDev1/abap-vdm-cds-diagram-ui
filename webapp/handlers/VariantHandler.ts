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
import Renderer from "../renderer/Renderer";
import CheckBox from "sap/m/CheckBox";
import VariantStateMapper from "../helpers/VariantStateMapper";
import { IVariantState } from "../types/IVariantState";


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

        const sEngine = (this._oView.byId("selEngine") as Select).getSelectedKey();
        const oCbPositions = new CheckBox({ text: "Save exact node positions (Custom Layout)", selected: true, visible: sEngine === "CYTOSCAPE" });
        oCbPositions.addStyleClass("sapUiSmallMarginTop");

        // Construct the Dialog control dynamically
        const oDialog = new Dialog({
            title: this._fnGetText("ttSaveVariant"),
            content: [new VBox({ items: [oInput, oCbPositions] })],
            beginButton: new Button({
                text: "Save",
                type: "Emphasized",
                press: () => this._handleSaveVariantDialogConfirm(oInput.getValue().trim(), oCbPositions.getSelected(), oDialog)
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
     * @param {Function} [fnGenerateCallback] - Optional callback to trigger generation after application.
     * @public
     */
    public applyVariant(oEvent: Event, fnGenerateCallback?: () => void): void {
        const sSelectedName = (oEvent.getSource() as Select).getSelectedKey();
        const oModel = this._oView.getModel("variants") as JSONModel;
        
        // Retrieve the full variant configuration object
        const aVariants: IVariantState[] = oModel.getProperty("/items");
        const oVariant = aVariants.find(v => v.name === sSelectedName);

        if (oVariant) {
            VariantStateMapper.applyState(this._oView, oVariant);
            MessageToast.show(this._fnGetText("msgVariantApplied", [oVariant.name]));
            
            if (fnGenerateCallback) {
                // Slight timeout ensures UI5 models finish evaluating prior to executing generation
                setTimeout(fnGenerateCallback, 50);
            }
        }
    }

    /**
     * Validates the provided variant name and checks for existing overwrites.
     * Triggers an explicit confirmation prompt if the name already exists.
     * @param {string} sName - The name entered by the user in the dialog.
     * @param {boolean} bSavePositions - Whether to snapshot the canvas X/Y coordinates.
     * @param {Dialog} oDialog - Reference to the dialog to close upon success.
     * @private
     */
    private _handleSaveVariantDialogConfirm(sName: string, bSavePositions: boolean, oDialog: Dialog): void {
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
                            this._executeVariantSave(sName, bSavePositions, oModel);
                            oDialog.close();
                        }
                    }
                }
            );
        } else {
            this._executeVariantSave(sName, bSavePositions, oModel);
            oDialog.close();
        }
    }

    /**
     * Executes the actual local storage save by capturing the current UI state.
     * @param {string} sName - Validated variant name.
     * @param {boolean} bSavePositions - Whether to snapshot the canvas X/Y coordinates.
     * @param {JSONModel} oModel - The UI model holding the variant list.
     * @private
     */
    private _executeVariantSave(sName: string, bSavePositions: boolean, oModel: JSONModel): void {
        const oState = VariantStateMapper.captureState(this._oView, sName, bSavePositions);
        const aVariants = VariantManager.saveVariant(oState);
        
        // Update the binding so the dropdown immediately reflects the new list
        oModel.setProperty("/items", aVariants);
        (this._oView.byId("selVariant") as Select).setSelectedKey(sName);

        MessageToast.show(this._fnGetText("msgVariantSaved", [sName]));
    }
}