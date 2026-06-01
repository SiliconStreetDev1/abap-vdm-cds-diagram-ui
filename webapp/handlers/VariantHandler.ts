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
    private view: View;
    private getText: (key: string, args?: any[]) => string;

    /**
     * Initializes the VariantHandler.
     * @param {View} view - Reference to the main view to access controls and models.
     * @param {Function} getText - Delegate function to safely retrieve i18n translations.
     */
    constructor(view: View, getText: (key: string, args?: any[]) => string) {
        this.view = view;
        this.getText = getText;
    }

    /**
     * Hydrates persistent history and variant models from local storage on app load.
     * Binds them to named JSONModels so the UI dropdowns auto-populate.
     * @public
     */
    public loadHistoryAndVariants(): void {
        this.view.setModel(new JSONModel({ items: VariantManager.getHistory() }), "history");
        this.view.setModel(new JSONModel({ items: VariantManager.getVariants() }), "variants");
    }

    /**
     * Updates the search history persistence layer.
     * @param {string} name - Target CDS object name to add to the recent history stack.
     * @public
     */
    public updateHistory(name: string): void {
        const historyItems = VariantManager.updateHistory(name);
        (this.view.getModel("history") as JSONModel).setProperty("/items", historyItems);
    }

    /**
     * Initiates the Variant Save workflow by programmatically building an SAPUI5 Dialog.
     * @public
     */
    public openSaveDialog(): void {
        const uiModel = this.view.getModel("ui") as JSONModel;
        const wasDragged = uiModel ? uiModel.getProperty("/nodesDragged") : false;

        // Pre-fill the input with the currently selected variant name if one exists
        const currentVariant = (this.view.byId("selVariant") as Select).getSelectedKey() || "";
        const inputField = new Input({ value: currentVariant, placeholder: this.getText("phVariantName") });

        const engineSelect = this.view.byId("selEngine") as Select;
        const engine = engineSelect ? engineSelect.getSelectedKey() : "";
        const positionCheckbox = new CheckBox({ text: "Save exact node positions (Custom Layout)", selected: wasDragged, visible: engine === "CYTOSCAPE" });
        positionCheckbox.addStyleClass("sapUiSmallMarginTop");

        // Construct the Dialog control dynamically
        const saveDialog = new Dialog({
            title: this.getText("ttSaveVariant"),
            content: [new VBox({ items: [inputField, positionCheckbox] })],
            beginButton: new Button({
                text: "Save",
                type: "Emphasized",
                press: () => this.handleSaveVariantDialogConfirm(inputField.getValue().trim(), positionCheckbox.getSelected(), saveDialog)
            }),
            endButton: new Button({ text: "Cancel", press: () => saveDialog.close() }),
            // Critical: Ensure the DOM is cleaned up to prevent memory leaks with duplicate IDs
            afterClose: () => saveDialog.destroy()
        });

        saveDialog.addStyleClass("sapUiContentPadding");
        
        // Attach to the view to inherit CSS classes (like cozy/compact) and i18n models
        this.view.addDependent(saveDialog);
        saveDialog.open();
    }

    /**
     * Removes the currently selected variant from local persistence and updates the UI.
     * Wraps the asynchronous confirmation prompt in a Promise to eliminate polling.
     * @public
     * @returns {Promise<void>} Resolves if deleted, rejects if cancelled or failed.
     */
    public deleteSelected(): Promise<void> {
        return new Promise((resolve, reject) => {
            const variantSelect = this.view.byId("selVariant") as Select;
            const selectedName = variantSelect ? variantSelect.getSelectedKey() : "";
            
            if (!selectedName) {
                reject(new Error("No variant selected"));
                return;
            }

            MessageBox.confirm(
                this.getText("msgDeleteVariantConfirm", [selectedName]) || `Delete variant "${selectedName}"?`,
                {
                    title: this.getText("ttDeleteVariant"),
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: (action: string) => {
                        if (action === MessageBox.Action.YES) {
                            const remainingVariants = VariantManager.deleteVariant(selectedName);
                            (this.view.getModel("variants") as JSONModel).setProperty("/items", remainingVariants);
                            MessageToast.show(this.getText("msgVariantDeleted", [selectedName]));
                            resolve();
                        } else {
                            reject(new Error("Variant deletion aborted by user"));
                        }
                    }
                }
            );
        });
    }

    /**
     * Handles variant selection from the dropdown. 
     * Re-hydrates all UI state, layout logic, formatting objects, and token lists.
     * @param {Event} oEvent - Selection change event from the Variant Select control.
     * @param {Function} [fnGenerateCallback] - Optional callback to trigger generation after application.
     * @public
     */
    public applyVariant(event: Event, generateCallback?: () => void): void {
        const selectedName = (event.getSource() as Select).getSelectedKey();
        const variantsModel = this.view.getModel("variants") as JSONModel;
        
        // Retrieve the full variant configuration object
        const variants: IVariantState[] = variantsModel.getProperty("/items") || [];
        const variant = variants.find((v: IVariantState) => v.name === selectedName);

        if (variant) {
            VariantStateMapper.applyState(this.view, variant);
            MessageToast.show(this.getText("msgVariantApplied", [variant.name]));
            
            const uiModel = this.view.getModel("ui") as JSONModel;
            if (uiModel) {
                uiModel.setProperty("/variantDirty", false);
                uiModel.setProperty("/nodesDragged", false);
            }

            const selectControl = this.view.byId("selVariant") as Select;
            if (selectControl) {
                selectControl.setValueState("None");
                selectControl.setValueStateText("");
            }
            
            if (generateCallback) {
                // UI5 model and control getters are synchronous; arbitrary timeouts are unnecessary
                generateCallback();
            }
        }
    }

    /**
     * Validates the provided variant name and checks for existing overwrites.
     * Triggers an explicit confirmation prompt if the name already exists.
     * @param {string} name - The name entered by the user in the dialog.
     * @param {boolean} savePositions - Whether to snapshot the canvas X/Y coordinates.
     * @param {Dialog} dialog - Reference to the dialog to close upon success.
     * @private
     */
    private handleSaveVariantDialogConfirm(name: string, savePositions: boolean, dialog: Dialog): void {
        if (!name) {
            MessageToast.show(this.getText("msgEnterName"));
            return;
        }

        const variantsModel = this.view.getModel("variants") as JSONModel;
        const exists = (variantsModel.getProperty("/items") || []).some((v: IVariantState) => v.name === name);

        if (exists) {
            MessageBox.confirm(
                this.getText("msgOverwriteText", [name]),
                {
                    title: this.getText("msgOverwriteTitle"),
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: (action: string) => {
                        if (action === MessageBox.Action.YES) {
                            this.executeVariantSave(name, savePositions, variantsModel);
                            dialog.close();
                        }
                    }
                }
            );
        } else {
            this.executeVariantSave(name, savePositions, variantsModel);
            dialog.close();
        }
    }

    /**
     * Executes the actual local storage save by capturing the current UI state.
     * @param {string} name - Validated variant name.
     * @param {boolean} savePositions - Whether to snapshot the canvas X/Y coordinates.
     * @param {JSONModel} model - The UI model holding the variant list.
     * @private
     */
    private executeVariantSave(name: string, savePositions: boolean, model: JSONModel): void {
        const state = VariantStateMapper.captureState(this.view, name, savePositions);
        const variants = VariantManager.saveVariant(state);
        
        // Update the binding so the dropdown immediately reflects the new list
        model.setProperty("/items", variants);
        
        const uiModel = this.view.getModel("ui") as JSONModel;
        if (uiModel) {
            uiModel.setProperty("/variantDirty", false);
            uiModel.setProperty("/nodesDragged", false);
        }

        const selectControl = this.view.byId("selVariant") as Select;
        if (selectControl) {
            selectControl.setSelectedKey(name);
            selectControl.setValueState("None");
            selectControl.setValueStateText("");
        }

        MessageToast.show(this.getText("msgVariantSaved", [name]));
    }
}