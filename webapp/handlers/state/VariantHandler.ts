/**
 * @fileoverview Manages the UI lifecycle for saving, loading, and confirming View Variants.
 * @description Extracts all variant DOM prompts from the Main Controller. 
 * Adheres to SRP by strictly returning user intents via Promises, performing zero network calls.
 */
import View from "sap/ui/core/mvc/View";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import VBox from "sap/m/VBox";
import CheckBox from "sap/m/CheckBox";
import MessageToast from "sap/m/MessageToast";

export interface ISaveVariantIntent {
    name: string;
    savePositions: boolean;
    isGlobal: boolean;
}

export default class VariantHandler {
    private view: View;
    private getText: (key: string, args?: any[]) => string;

    /**
     * @public
     * @description Instantiates the handler with references to the parent view and translation framework.
     * @param {View} view - Reference to the active SAPUI5 View to establish dialog dependencies.
     * @param {Function} getText - Delegate function to safely retrieve i18n translation strings.
     */
    constructor(view: View, getText: (key: string, args?: any[]) => string) {
        this.view = view;
        this.getText = getText;
    }

    /**
     * @public
     * Initiates the Variant Save workflow by programmatically building an SAPUI5 Dialog.
     * Evaluates overwrite collisions and read-only invariants.
     * Uses a Promise to invert control, eliminating callback spaghetti from the UI layer.
     * @param {string} defaultName - The currently active variant name to pre-fill.
     * @param {boolean} defaultPositions - Pre-fill state for the 'save positions' checkbox.
     * @param {boolean} showPositionCheckbox - Dynamic visibility bound to the active engine's capabilities.
     * @param {boolean} defaultGlobal - Pre-fill state indicating if the variant is currently public.
     * @param {any[]} existingVariants - Array of existing variant metadata for overwrite/read-only validation.
     * @returns {Promise<ISaveVariantIntent>} Resolves with the user's intent payload. Rejects if cancelled.
     */
    public promptSave(defaultName: string, defaultPositions: boolean, showPositionCheckbox: boolean, defaultGlobal: boolean, existingVariants: any[]): Promise<ISaveVariantIntent> {
        return new Promise((resolve, reject) => {
            const inputField = new Input({ value: defaultName, placeholder: this.getText("phVariantName") });

            const positionCheckbox = new CheckBox({ 
                text: "Save exact node positions (Custom Layout)", 
                selected: true, 
                enabled: false,
                visible: showPositionCheckbox 
            }).addStyleClass("sapUiSmallMarginTop");

            const globalCheckbox = new CheckBox({ 
                text: "Share globally (Public)", 
                selected: defaultGlobal 
            }).addStyleClass("sapUiSmallMarginTop");

            const updateStates = (name: string) => {
                const existing = existingVariants.find((v: any) => v.name === name);

                if (existing) {
                    globalCheckbox.setSelected(!!existing.IsGlobal);
                } else {
                    globalCheckbox.setSelected(defaultGlobal);
                }
            };

            inputField.attachLiveChange((e: any) => updateStates(e.getParameter("value").trim()));
            updateStates(defaultName);

            const saveDialog = new Dialog({
                title: this.getText("ttSaveVariant"),
                content: [
                    new VBox({ 
                        items: [
                            inputField, 
                            positionCheckbox,
                            globalCheckbox
                        ] 
                    })
                ],
                beginButton: new Button({
                    text: "Save",
                    type: "Emphasized",
                    press: () => {
                        const name = inputField.getValue().trim();
                        if (!name) {
                            MessageToast.show(this.getText("msgEnterName"));
                            return;
                        }

                        const existingVariant = existingVariants.find((v: any) => v.name === name);
                        
                        const intent: ISaveVariantIntent = {
                            name,
                            savePositions: positionCheckbox.getSelected(),
                            isGlobal: globalCheckbox.getSelected()
                        };

                        if (existingVariant) {
                            MessageBox.confirm(
                                this.getText("msgOverwriteText", [name]),
                                {
                                    title: this.getText("msgOverwriteTitle"),
                                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                                    onClose: (action: string) => {
                                        if (action === MessageBox.Action.YES) {
                                            resolve(intent);
                                            saveDialog.close();
                                        }
                                    }
                                }
                            );
                        } else {
                            resolve(intent);
                            saveDialog.close();
                        }
                    }
                }),
                endButton: new Button({ 
                    text: "Cancel", 
                    press: () => {
                        reject(new Error("CANCELLED"));
                        saveDialog.close();
                    }
                }),
                afterClose: () => saveDialog.destroy()
            });

            saveDialog.addStyleClass("sapUiContentPadding");
            this.view.addDependent(saveDialog);
            saveDialog.open();
        });
    }

    /**
     * @public
     * Prompts the user to confirm deletion of a variant.
     * Wraps the asynchronous MessageBox prompt in a Promise to provide a clean async/await consumption model.
     * @param {string} variantName - The human-readable name of the variant to delete.
     * @returns {Promise<void>} Resolves if the user confirms deletion. Rejects if aborted.
     */
    public promptDelete(variantName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!variantName) {
                reject(new Error("No variant selected"));
                return;
            }

            MessageBox.confirm(
                this.getText("msgDeleteVariantConfirm", [variantName]) || `Delete variant "${variantName}"?`,
                {
                    title: this.getText("ttDeleteVariant"),
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: (action: string) => {
                        if (action === MessageBox.Action.YES) {
                            resolve();
                        } else {
                            reject(new Error("CANCELLED"));
                        }
                    }
                }
            );
        });
    }
}