/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Orchestrates the Variant lifecycle workflow.
 * @description Extracts business logic for saving, applying, deleting, and sharing 
 * diagram variants to uphold the Single Responsibility Principle.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Select from "sap/m/Select";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";

import VariantHandler from "./VariantHandler";
import StateSyncModule from "../../helpers/StateSyncModule";
import VariantService from "../../services/VariantService";
import DeepLinkService from "../../services/DeepLinkService";
import ViewStateHelper from "../../helpers/ViewStateHelper";
import DiagramGenerationHandler from "./DiagramGenerationHandler";
import { UiState } from "../../constants/StateConstants";
import Renderer from "../../renderer/Renderer";
import ErrorHandler from "../ErrorHandler";

/**
 * @class VariantOrchestrationHandler
 * @description Encapsulates and orchestrates OData backend interactions and UI state transitions for Variants.
 */
export default class VariantOrchestrationHandler {
    private _oView: View;
    private _variantHandler: VariantHandler;
    private _generationHandler: DiagramGenerationHandler;
    private _fnGetText: (k: string, args?: any[]) => string;

    /**
     * @constructor
     * @param {View} oView - Reference to the active UI5 view.
     * @param {VariantHandler} variantHandler - Handler for variant dialog prompts.
     * @param {DiagramGenerationHandler} generationHandler - Handler for triggering diagram renders.
     * @param {Function} fnGetText - Delegate function for i18n translations.
     */
    constructor(oView: View, variantHandler: VariantHandler, generationHandler: DiagramGenerationHandler, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._variantHandler = variantHandler;
        this._generationHandler = generationHandler;
        this._fnGetText = fnGetText;
    }

    /**
     * @private
     * @returns {JSONModel} The Fiori UI state model.
     */
    private get _uiModel(): JSONModel {
        return this._oView.getModel("ui") as JSONModel;
    }

    /**
     * @private
     * @returns {JSONModel} The Variants list model.
     */
    private get _variantsModel(): JSONModel {
        return this._oView.getModel("variants") as JSONModel;
    }

    /**
     * @private
     * @returns {ODataModel} The active OData V4 model bound to the application.
     */
    private get _odataModel(): ODataModel {
        return (this._oView.getModel() || this._oView.getController()?.getOwnerComponent()?.getModel()) as ODataModel;
    }

    /**
     * @private
     * @returns {string} The overarching Component ID or localized View ID.
     */
    private getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId() || "";
    }

    /**
     * @public
     * @description Synchronizes the toolbar sharing icon state and indicators based on the currently selected variant.
     */
    public updateShareStateUI(): void {
        const variantSelect = this._oView.byId("selVariant") as Select;
        if (!this._uiModel || !variantSelect || !this._variantsModel) return;

        const selectedName = variantSelect.getSelectedKey();
        const variants = this._variantsModel.getProperty("/items") || [];
        const variant = variants.find((v: any) => v.VariantId === selectedName);

        this._uiModel.setProperty(UiState.IS_GLOBAL, variant ? !!variant.IsGlobal : false);
        this._uiModel.setProperty(UiState.IS_UNLISTED, variant ? !!variant.isUnlisted : false);
    }

    /**
     * @public
     * @description Orchestrates the Variant Save Workflow. Retrieves user intent from the UI Handler, 
     * executes the OData updates via the Service, and binds the fresh data to the local view.
     * @returns {Promise<void>} Resolves when the save operation is completed and models are refreshed.
     */
    public async saveVariant(): Promise<void> {
        if (!this._uiModel || !this._uiModel.getProperty(UiState.LAST_GENERATED_CDS)) {
            MessageToast.show(this._fnGetText("msgEmptyTitle") || "No diagram generated to save.");
            return;
        }

        const variantSelect = this._oView.byId("selVariant") as Select;
        const currentVariantId = variantSelect?.getSelectedKey() || "";
        const wasDragged = this._uiModel?.getProperty(UiState.NODES_DRAGGED) || false;
        const engineSelect = this._oView.byId("selEngine") as Select;
        const engine = engineSelect?.getSelectedKey() || Renderer.getDefaultEngine();
        
        const formatKey = Object.keys(this._uiModel?.getData() || {}).find(key => key.toUpperCase() === `FORMAT${engine}`) || "formatCytoscape";
        const hasPresetPositions = !!this._uiModel?.getProperty(`/${formatKey}/presetPositions`);

        const existingVariants = this._variantsModel?.getProperty("/items") || [];
        const existingVariant = existingVariants.find((v: any) => v.VariantId === currentVariantId);
        let currentVariantName = existingVariant ? existingVariant.name : "";
        if (!currentVariantName && !currentVariantId) {
            currentVariantName = this._uiModel?.getProperty("/clonedVariantName") || "";
        }
        const isGlobal = existingVariant ? !!existingVariant.IsGlobal : false;

        try {
            const intent = await this._variantHandler.promptSave(
                currentVariantName, 
                wasDragged || hasPresetPositions, 
                Renderer.supportsStateCapture(engine), 
                isGlobal,
                existingVariants
            );

            ViewStateHelper.setAppBusy(true, this._oView);
            
            const oUiModel = this._oView.getModel("ui") as JSONModel;
            const state = StateSyncModule.captureState(oUiModel, intent.name, intent.savePositions, this._oView, this.getInstanceId());
            const targetVariant = existingVariants.find((v: any) => v.name === intent.name);
            const preserveUnlisted = targetVariant ? targetVariant.isUnlisted : false;
            
            if (targetVariant && targetVariant.VariantId) {
                await VariantService.updateVariant(this._odataModel, targetVariant.VariantId, state, intent.isGlobal, preserveUnlisted);
            } else {
                await VariantService.createVariant(this._odataModel, state, intent.isGlobal, false);
            }
            
            const refreshedVariants = await VariantService.loadVariants(this._odataModel);
            this._variantsModel?.setProperty("/items", refreshedVariants);
            const savedVariant = refreshedVariants.find((v: any) => v.name === intent.name);
            
            this._uiModel?.setProperty(UiState.VARIANT_DIRTY, false);
            this._uiModel?.setProperty(UiState.NODES_DRAGGED, false);
            this._uiModel?.setProperty("/clonedVariantName", "");
            this._uiModel?.setProperty(UiState.SELECTED_VARIANT, savedVariant ? (savedVariant as any).VariantId : "");

            if (variantSelect) {
                variantSelect.setValueState("None");
                variantSelect.setValueStateText("");
            }
            
            this.updateShareStateUI();
            MessageToast.show(this._fnGetText("msgVariantSaved", [intent.name]));
        } catch (error: any) {
            ErrorHandler.handle(error, "Failed to save variant to backend.");
        } finally {
            ViewStateHelper.setAppBusy(false, this._oView);
        }
    }

    /**
     * @public
     * @description Orchestrates the deletion workflow. Confirms user intent, triggers the OData deletion, 
     * and safely resets the dropdown and layout state.
     * @returns {Promise<void>} Resolves when the delete operation is completed and models are refreshed.
     */
    public async deleteVariant(): Promise<void> { 
        const variantSelect = this._oView.byId("selVariant") as Select;
        const selectedId = variantSelect ? variantSelect.getSelectedKey() : "";

        try {
            const variantToDelete = (this._variantsModel.getProperty("/items") || []).find((v: any) => v.VariantId === selectedId);
            await this._variantHandler.promptDelete(variantToDelete ? variantToDelete.name : selectedId);

            ViewStateHelper.setAppBusy(true, this._oView);
            
            if (variantToDelete && variantToDelete.VariantId) {
                await VariantService.deleteVariant(this._odataModel, variantToDelete.VariantId);
            }
            
            const refreshedVariants = await VariantService.loadVariants(this._odataModel);
            this._variantsModel.setProperty("/items", refreshedVariants);
            
            if (variantSelect) {
                this._uiModel?.setProperty(UiState.SELECTED_VARIANT, "");
                variantSelect.setValueState("None");
            }

            if (refreshedVariants.length === 0) {
                if (this._uiModel) this._uiModel.setProperty(UiState.VARIANT_DIRTY, false);
            }
            
            this.updateShareStateUI();
            MessageToast.show(this._fnGetText("msgVariantDeleted", [variantToDelete ? variantToDelete.name : selectedId]));
        } catch (error: any) {
            ErrorHandler.handle(error, "Failed to delete variant from server.");
        } finally {
            ViewStateHelper.setAppBusy(false, this._oView);
        }
    }

    /**
     * @public
     * @description Event handler for Variant Dropdown selection change. Clears dirty states and applies the configuration.
     * @param {Event} e - Select control interaction event.
     * @returns {Promise<void>} Resolves when the newly selected variant is fully applied.
     */
    public async changeVariant(e: Event): Promise<void> { 
        const variantSelect = e.getSource() as Select;
        if (variantSelect) variantSelect.setValueState("None");
        if (this._uiModel) this._uiModel.setProperty(UiState.VARIANT_DIRTY, false);

        const selectedId = variantSelect ? variantSelect.getSelectedKey() : "";
        if (!selectedId) return;
        await this.applyVariant(selectedId);
        this.updateShareStateUI();
    }

    /**
     * @public
     * @description Resets the physical canvas to the pristine state of the currently selected variant.
     * @returns {Promise<void>} Resolves when the layout is fully restored.
     */
    public async revertVariant(): Promise<void> {
        const variantSelect = this._oView.byId("selVariant") as Select;
        if (variantSelect && variantSelect.getSelectedKey()) {
            variantSelect.setValueState("None");
            if (this._uiModel) this._uiModel.setProperty(UiState.VARIANT_DIRTY, false);
            await this.applyVariant(variantSelect.getSelectedKey());
        }
    }

    /**
     * @public
     * @description Detaches the current canvas state from any loaded variant. Marks the UI as unsaved.
     */
    public clearVariant(): void {
        if (this._uiModel) {
            this._uiModel.setProperty(UiState.SELECTED_VARIANT, "");
            this._uiModel.setProperty(UiState.VARIANT_DIRTY, false);
        }
        const variantSelect = this._oView.byId("selVariant") as Select;
        if (variantSelect) {
            variantSelect.setValueState("None");
            variantSelect.setValueStateText("");
        }
        MessageToast.show(this._fnGetText("msgVariantCleared") || "Variant selection cleared.");
        this.updateShareStateUI();
    }

    /**
     * @public
     * @description Internal logic to deeply apply a selected variant's layout, formatting, and parameters to the current canvas session.
     * @param {string} selectedId - The target variant UUID.
     * @returns {Promise<void>} Resolves when the diagram and settings are entirely restored.
     */
    public async applyVariant(selectedId: string): Promise<void> {
        if (!selectedId) return;
        
        ViewStateHelper.setAppBusy(true, this._oView);
        try {
            const variant = await VariantService.getVariantById(this._odataModel, selectedId);

            if (variant) {
                const oUiModel = this._oView.getModel("ui") as JSONModel;
                StateSyncModule.applyState(oUiModel, variant, this._oView);
                MessageToast.show(this._fnGetText("msgVariantApplied", [variant.name]));
                
                if (this._uiModel) {
                    this._uiModel.setProperty(UiState.VARIANT_DIRTY, false);
                    this._uiModel.setProperty(UiState.NODES_DRAGGED, false);
                }

                const selectControl = this._oView.byId("selVariant") as Select;
                if (selectControl) {
                    selectControl.setValueState("None");
                    selectControl.setValueStateText("");
                }
                
                await this._generationHandler.generate(false, false, true); 
                this.updateShareStateUI();
            }
        } catch (error: any) {
            ErrorHandler.handle(error, "Failed to load variant configuration.");
        } finally {
            ViewStateHelper.setAppBusy(false, this._oView);
        }
    }

    /**
     * @public
     * @description Orchestrates the Share Link generation and clipboard copy mechanism.
     * Prompts the user to generate an unlisted deep link if the variant is private.
     * @returns {Promise<void>}
     */
    public async shareVariant(): Promise<void> {
        const variantSelect = this._oView.byId("selVariant") as Select;
        const selectedVariantId = variantSelect?.getSelectedKey();

        if (!selectedVariantId) {
            MessageToast.show(this._fnGetText("msgSelectVariantToShare") || "Please select a saved variant to share.");
            return;
        }

        const variants = this._variantsModel.getProperty("/items") || [];
        const variant = variants.find((v: any) => v.VariantId === selectedVariantId);

        if (!variant || !variant.VariantId) {
            MessageToast.show("Cannot share an unsaved variant.");
            return;
        }

        if (variant.isUnlisted || variant.IsGlobal) {
            await this._copyShareLink(variant.VariantId);
            return;
        }

        MessageBox.confirm(
            this._fnGetText("msgShareLinkPrompt") || "Generate a shareable link? (This will not publish it to the global dropdown).",
            {
                title: this._fnGetText("ttShareVariant") || "Share Link",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: async (action: string) => {
                    if (action === MessageBox.Action.YES) {
                        ViewStateHelper.setAppBusy(true, this._oView);
                        try {
                            await VariantService.generateShareLink(this._odataModel, variant.VariantId);
                            (variant as any).isUnlisted = true;
                            this._variantsModel.refresh(true);
                            this.updateShareStateUI();
                            await this._copyShareLink(variant.VariantId);
                        } catch (error: any) {
                            ErrorHandler.handle(error, "Failed to generate share link.");
                        } finally {
                            ViewStateHelper.setAppBusy(false, this._oView);
                        }
                    }
                }
            }
        );
    }

    /**
     * @private
     * @description DRY wrapper to explicitly copy the generated URL to the OS clipboard and emit the correct success toast.
     * @param {string} variantId - The backend UUID of the target variant.
     */
    private async _copyShareLink(variantId: string): Promise<void> {
        const shareUrl = await DeepLinkService.generateShareUrl(variantId);
        if (navigator?.clipboard) {
            await navigator.clipboard.writeText(shareUrl);
            MessageToast.show(this._fnGetText("msgLinkCopied") || "Shareable link copied to clipboard!");
        } else {
            MessageBox.information(this._fnGetText("msgLinkGenerated") || "Share Link:", { details: shareUrl });
        }
    }

    /**
     * @public
     * @description Instantly revokes sharing permissions, reverting the unlisted variant to strictly private.
     * @returns {Promise<void>} Resolves when the revoke backend patch is confirmed.
     */
    public async revokeShare(): Promise<void> {
        const variantSelect = this._oView.byId("selVariant") as Select;
        const selectedVariantId = variantSelect?.getSelectedKey();
        if (!selectedVariantId) return;

        const variants = this._variantsModel.getProperty("/items") || [];
        const variant = variants.find((v: any) => v.VariantId === selectedVariantId);

        if (!variant || !variant.VariantId) {
            MessageToast.show("Cannot revoke an unsaved variant.");
            return;
        }

        if (variant.IsGlobal) {
            MessageToast.show("Cannot revoke share on a Global variant. Please uncheck 'Global' and save first.");
            return;
        }

        ViewStateHelper.setAppBusy(true, this._oView);
        try {
            await VariantService.revokeShareLink(this._odataModel, variant.VariantId);
            
            // Apply the privacy changes locally
            (variant as any).isUnlisted = false;
            (variant as any).IsGlobal = false;
            
            this._variantsModel.refresh(true);
            this.updateShareStateUI();
            MessageToast.show(this._fnGetText("msgRevokeSuccess") || "Sharing revoked. Variant is now fully private.");
        } catch (error: any) {
            ErrorHandler.handle(error, "Failed to revoke share link.");
        } finally {
            ViewStateHelper.setAppBusy(false, this._oView);
        }
    }
}