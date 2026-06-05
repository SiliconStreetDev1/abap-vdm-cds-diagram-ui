/**
 * @fileoverview Selection Controller for capturing user input.
 * @description Manages configuration state, triggers the OData backend service, 
 * orchestrates the Variant lifecycle workflow, and broadcasts payloads via the EventBus. 
 */

import Controller from "sap/ui/core/mvc/Controller";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Event from "sap/ui/base/Event";
import Select from "sap/m/Select";
import Input from "sap/m/Input";
import MultiInput from "sap/m/MultiInput";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";

import VariantHandler from "../handlers/state/VariantHandler";
import VariantStateMapper from "../helpers/VariantStateMapper";
import SessionStateCache from "../helpers/SessionStateCache";
import DiagramGenerationHandler from "../handlers/state/DiagramGenerationHandler";
import SelectionStateHandler from "../handlers/state/SelectionStateHandler";
import SelectionUIHandler from "../handlers/ui/SelectionUIHandler";
import InputValidationService from "../services/InputValidationService";
import VariantService from "../services/VariantService";
import SearchHistoryService from "../services/SearchHistoryService";
import ViewStateHelper from "../helpers/ViewStateHelper";
import Renderer from "../renderer/Renderer";
import { EventChannels, EventIds, DomEvents } from "../constants/EventConstants";
import { UiState, DiagramData } from "../constants/StateConstants";
import ContextHelpManager from "../helpers/ContextHelpManager";
import { IVariantState } from "../types/IVariantState";

export default class Selection extends Controller {

    private variantHandler!: VariantHandler;
    private generationHandler!: DiagramGenerationHandler;
    private stateHandler!: SelectionStateHandler;
    private uiHandler!: SelectionUIHandler;

    private nodeDrillDownRequestBind!: EventListener;
    private sliderUpdateBind!: EventListener;
    private canvasStateChangedBind!: EventListener;
    private eventBusDrillDownBind!: (channel: string, event: string, data: Object) => void;

    /**
     * @private
     * Resolves the overarching Component ID to group Views in the same FCL.
     * Prevents cross-contamination of cache keys between distinct Fiori tiles.
     * @returns {string} The overarching Component ID or localized View ID.
     */
    private getInstanceId(): string {
        return this.getOwnerComponent()?.getId() || this.getView()?.getId() || "";
    }

    /**
     * @public
     * Lifecycle hook. Bootstraps local handlers, validators, and default UI state.
     * Sets up EventBus subscriptions for decoupled cross-pane communication.
     */
    public onInit(): void {
        const view = this.getView();
        if (!view) return;

        this.variantHandler = new VariantHandler(view, this.getText.bind(this));
        this.stateHandler = new SelectionStateHandler(view, this.getText.bind(this));
        
        const eventBus = this.getOwnerComponent()?.getEventBus();
        this.generationHandler = new DiagramGenerationHandler(view, eventBus, this.getText.bind(this));
        this.uiHandler = new SelectionUIHandler(view, eventBus, this.stateHandler, this.getText.bind(this));

        const incInput = this.byId("inpInclude") as MultiInput;
        const excInput = this.byId("inpExclude") as MultiInput;
        const fnWarn = (key: string) => MessageToast.show(this.getText(key));
        
        const tokenValidator = InputValidationService.buildTokenValidator(incInput, excInput, fnWarn);
        incInput.addValidator(tokenValidator);
        excInput.addValidator(tokenValidator);

        // Orchestrate Initial Model Hydration
        view.setModel(new JSONModel({ items: SearchHistoryService.getHistory() }), "history");
        view.setModel(new JSONModel({ items: [] }), "variants");

        const fetchVariants = async () => {
            const odataModel = (view.getModel() || this.getOwnerComponent()?.getModel()) as ODataModel;
            if (!odataModel) return;
            try {
                const variants = await VariantService.loadVariants(odataModel);
                (view.getModel("variants") as JSONModel).setProperty("/items", variants);
            } catch (error) {
                console.warn("VDM Diagrammer: Failed to fetch backend variants", error);
            }
        };

        if (view.getModel() || this.getOwnerComponent()?.getModel()) {
            fetchVariants();
        } else {
            view.attachEventOnce("modelContextChange", fetchVariants);
        }

        const instanceId = this.getOwnerComponent()?.getId() || view.getId();
        this.nodeDrillDownRequestBind = ((e: globalThis.Event) => {
            const customEvent = e as unknown as CustomEvent<{ viewId: string, viewName: string }>;
            if (customEvent.detail?.viewId && customEvent.detail.viewId !== instanceId) return;
            this.processDrillDown(customEvent.detail?.viewName as string);
        }) as EventListener;
        document.addEventListener(DomEvents.NODE_DRILL_DOWN, this.nodeDrillDownRequestBind);

        this.eventBusDrillDownBind = (channel: string, event: string, data: Object) => this.processDrillDown((data as { viewName?: string })?.viewName);
        if (eventBus) {
            eventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.NODE_DRILL_DOWN, this.eventBusDrillDownBind, this);
            eventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.APPLY_VARIANT_STATE, (c: string, e: string, state: any) => {
                VariantStateMapper.applyState(view as View, state as IVariantState);
            }, this);
        }

        this.sliderUpdateBind = this.uiHandler.onSliderUpdate.bind(this.uiHandler) as EventListener;
        document.addEventListener(DomEvents.FORMAT_SLIDER_UPDATE, this.sliderUpdateBind);

        this.canvasStateChangedBind = this.stateHandler.onCanvasStateChanged.bind(this.stateHandler) as EventListener;
        
        document.addEventListener(DomEvents.NODE_DRAGGED, this.canvasStateChangedBind);
        document.addEventListener(DomEvents.NODE_PINNED, this.canvasStateChangedBind);
        document.addEventListener(DomEvents.NODE_HIDDEN, this.canvasStateChangedBind);
        document.addEventListener(DomEvents.NODE_UNHIDDEN, this.canvasStateChangedBind);
    }

    /**
     * @public
     * @description Lifecycle hook. Detaches all global DOM listeners and EventBus subscriptions 
     * to prevent aggressive memory leaks when the view is destroyed.
     */
    public onExit(): void {
        document.removeEventListener(DomEvents.NODE_DRILL_DOWN, this.nodeDrillDownRequestBind);
        
        const eventBus = this.getOwnerComponent()?.getEventBus();
        if (eventBus) {
            eventBus.unsubscribe(EventChannels.DIAGRAM_ENGINE, EventIds.NODE_DRILL_DOWN, this.eventBusDrillDownBind, this);
        }
        document.removeEventListener(DomEvents.FORMAT_SLIDER_UPDATE, this.sliderUpdateBind);
        document.removeEventListener(DomEvents.NODE_DRAGGED, this.canvasStateChangedBind);
        document.removeEventListener(DomEvents.NODE_PINNED, this.canvasStateChangedBind);
        document.removeEventListener(DomEvents.NODE_HIDDEN, this.canvasStateChangedBind);
        document.removeEventListener(DomEvents.NODE_UNHIDDEN, this.canvasStateChangedBind);

        ContextHelpManager.destroy(this.getInstanceId());
    }

    /**
     * @private
     * @description Synchronizes the toolbar sharing icon state based on the selected variant.
     */
    private updateShareStateUI(): void {
        const uiModel = this.getView()?.getModel("ui") as JSONModel;
        const variantSelect = this.byId("selVariant") as Select;
        const variantsModel = this.getView()?.getModel("variants") as JSONModel;

        if (!uiModel || !variantSelect || !variantsModel) return;

        const selectedName = variantSelect.getSelectedKey();
        const variants = variantsModel.getProperty("/items") || [];
        const variant = variants.find((v: any) => v.VariantId === selectedName);

        uiModel.setProperty(UiState.IS_GLOBAL, variant ? !!variant.IsGlobal : false);
        uiModel.setProperty(UiState.IS_UNLISTED, variant ? !!variant.isUnlisted : false);
    }

    // ========================================================================
    // DELEGATED EVENT HANDLERS
    // ========================================================================

    /**
     * @public
     * @description Event handler for the Generate Diagram button.
     * @returns {void}
     */
    public onGenerate(): void { this.generationHandler.generate(false); }

    /**
     * @public
     * @description Event handler for Engine selection change. Triggers format config resets.
     * @param {Event} e - Control event.
     * @returns {void}
     */
    public onEngineChange(e: Event): void { this.uiHandler.onEngineChange(e); }

    /**
     * @public
     * @description Event handler for live formatting property changes (e.g. node spacing sliders).
     * @returns {void}
     */
    public onLiveFormatChange(): void { this.uiHandler.onLiveFormatChange(); }

    /**
     * @public
     * @description Event handler for Relationship mode changes (Lines vs Discovery).
     * @param {Event} e - SegmentedButton event.
     * @returns {void}
     */
    public onRelModeChange(e: Event): void { this.uiHandler.onRelModeChange(e); }

    /**
     * @public
     * Orchestrates the Variant Save Workflow. Retrieves user intent from the UI Handler, 
     * executes the OData updates via the Service, and binds the fresh data to the local view.
     * @returns {Promise<void>}
     */
    public async onSaveVariant(): Promise<void> {
        const uiModel = this.getView()?.getModel("ui") as JSONModel;
        const variantsModel = this.getView()?.getModel("variants") as JSONModel;
        const variantSelect = this.byId("selVariant") as Select;
        
        const currentVariantId = variantSelect?.getSelectedKey() || "";
        const wasDragged = uiModel?.getProperty(UiState.NODES_DRAGGED) || false;
        const engineSelect = this.byId("selEngine") as Select;
        const engine = engineSelect?.getSelectedKey() || Renderer.getDefaultEngine();
        
        const formatKey = Object.keys(uiModel?.getData() || {}).find(key => key.toUpperCase() === `FORMAT${engine}`) || "formatCytoscape";
        const hasPresetPositions = !!uiModel?.getProperty(`/${formatKey}/presetPositions`);

        const existingVariants = variantsModel?.getProperty("/items") || [];
        const existingVariant = existingVariants.find((v: any) => v.VariantId === currentVariantId);
        let currentVariantName = existingVariant ? existingVariant.name : "";
        if (!currentVariantName && !currentVariantId) {
            currentVariantName = uiModel?.getProperty("/clonedVariantName") || ""; // Hydrate from Clone workflow
        }
        const isGlobal = existingVariant ? !!existingVariant.IsGlobal : false;

        try {
            const intent = await this.variantHandler.promptSave(
                currentVariantName, 
                wasDragged || hasPresetPositions, 
                Renderer.supportsStateCapture(engine), 
                isGlobal,
                existingVariants
            );

            ViewStateHelper.setAppBusy(true, this.getView() as View);
            
            const odataModel = (this.getView()?.getModel() || this.getOwnerComponent()?.getModel()) as ODataModel;
            const state = VariantStateMapper.captureState(this.getView() as View, intent.name, intent.savePositions);
            
            const targetVariant = existingVariants.find((v: any) => v.name === intent.name);
            const preserveUnlisted = targetVariant ? targetVariant.isUnlisted : false;
            
            if (targetVariant && targetVariant.VariantId) {
                await VariantService.updateVariant(odataModel, targetVariant.VariantId, state, intent.isGlobal, preserveUnlisted);
            } else {
                await VariantService.createVariant(odataModel, state, intent.isGlobal, false);
            }
            
            const refreshedVariants = await VariantService.loadVariants(odataModel);
            variantsModel?.setProperty("/items", refreshedVariants);
            const savedVariant = refreshedVariants.find((v: any) => v.name === intent.name);
            
            uiModel?.setProperty(UiState.VARIANT_DIRTY, false);
            uiModel?.setProperty(UiState.NODES_DRAGGED, false);
            uiModel?.setProperty("/clonedVariantName", ""); // Wipe amnesia placeholder
            uiModel?.setProperty(UiState.SELECTED_VARIANT, savedVariant ? (savedVariant as any).VariantId : "");

            if (variantSelect) {
                variantSelect.setValueState("None");
                variantSelect.setValueStateText("");
            }
            
            this.updateShareStateUI();
            MessageToast.show(this.getText("msgVariantSaved", [intent.name]));
        } catch (error: any) {
            if (error.message !== "CANCELLED") {
                MessageBox.error(error.message || "Failed to save variant to backend.");
            }
        } finally {
            ViewStateHelper.setAppBusy(false, this.getView() as View);
        }
    }

    /**
     * @public
     * Orchestrates the deletion workflow. Confirms intent, triggers the OData deletion, 
     * and safely resets the dropdown state.
     * @returns {Promise<void>}
     */
    public async onDeleteVariant(): Promise<void> { 
        const variantSelect = this.byId("selVariant") as Select;
        const selectedId = variantSelect ? variantSelect.getSelectedKey() : "";

        try {
            const odataModel = (this.getView()?.getModel() || this.getOwnerComponent()?.getModel()) as ODataModel;
            const variantsModel = this.getView()?.getModel("variants") as JSONModel;
            const variantToDelete = (variantsModel.getProperty("/items") || []).find((v: any) => v.VariantId === selectedId);
            
            await this.variantHandler.promptDelete(variantToDelete ? variantToDelete.name : selectedId);

            ViewStateHelper.setAppBusy(true, this.getView() as View);
            
            if (variantToDelete && variantToDelete.VariantId) {
                await VariantService.deleteVariant(odataModel, variantToDelete.VariantId);
            }
            
            const refreshedVariants = await VariantService.loadVariants(odataModel);
            variantsModel.setProperty("/items", refreshedVariants);
            
            const uiModel = this.getView()?.getModel("ui") as JSONModel;
            
            if (variantSelect) {
                uiModel?.setProperty(UiState.SELECTED_VARIANT, "");
                variantSelect.setValueState("None");
            }

            if (refreshedVariants.length === 0) {
                if (uiModel) uiModel.setProperty(UiState.VARIANT_DIRTY, false);
            }
            
            this.updateShareStateUI();

            MessageToast.show(this.getText("msgVariantDeleted", [variantToDelete ? variantToDelete.name : selectedId]));
        } catch (error: any) {
            if (error.message !== "CANCELLED") {
                MessageBox.error(error.message || "Failed to delete variant from server.");
            }
        } finally {
            ViewStateHelper.setAppBusy(false, this.getView() as View);
        }
    }

    /**
     * @public
     * @description Event handler for Variant Dropdown selection change.
     * @param {Event} e - Select control event.
     * @returns {void}
     */
    public onVariantChange(e: Event): void { 
        const variantSelect = e.getSource() as Select;
        if (variantSelect) variantSelect.setValueState("None");

        const uiModel = this.getView()?.getModel("ui") as JSONModel;
        if (uiModel) uiModel.setProperty(UiState.VARIANT_DIRTY, false);

        const selectedId = variantSelect ? variantSelect.getSelectedKey() : "";
        if (!selectedId) return;
        this.applyVariant(selectedId);
        this.updateShareStateUI();
    }

    /**
     * @public
     * @description Resets the canvas to the pristine state of the currently selected variant.
     * @returns {void}
     */
    public onRevertVariant(): void {
        const variantSelect = this.byId("selVariant") as Select;
        if (variantSelect && variantSelect.getSelectedKey()) {
            variantSelect.setValueState("None");
            const uiModel = this.getView()?.getModel("ui") as JSONModel;
            if (uiModel) uiModel.setProperty(UiState.VARIANT_DIRTY, false);

            const selectedId = variantSelect.getSelectedKey();
            this.applyVariant(selectedId);
        }
    }

    /**
     * @public
     * @description Detaches the current canvas state from any loaded variant.
     */
    public onClearVariant(): void {
        const uiModel = this.getView()?.getModel("ui") as JSONModel;
        if (uiModel) {
            uiModel.setProperty(UiState.SELECTED_VARIANT, "");
            uiModel.setProperty(UiState.VARIANT_DIRTY, false);
        }
        
        const variantSelect = this.byId("selVariant") as Select;
        if (variantSelect) {
            variantSelect.setValueState("None");
            variantSelect.setValueStateText("");
        }
        
        MessageToast.show(this.getText("msgVariantCleared") || "Variant selection cleared.");
        this.updateShareStateUI();
    }
    
    /**
     * @private
     * @description Internal logic to deeply apply a selected variant to the current canvas session.
     * @param {string} selectedId - The target variant ID.
     * @returns {void}
     */
    private applyVariant(selectedId: string): void {
        if (!selectedId) return;
        
        const variantsModel = this.getView()?.getModel("variants") as JSONModel;
        const variants: IVariantState[] = variantsModel?.getProperty("/items") || [];
        const variant = variants.find((v: any) => v.VariantId === selectedId);

        if (variant) {
            VariantStateMapper.applyState(this.getView() as View, variant);
            MessageToast.show(this.getText("msgVariantApplied", [variant.name]));
            
            const uiModel = this.getView()?.getModel("ui") as JSONModel;
            if (uiModel) {
                uiModel.setProperty(UiState.VARIANT_DIRTY, false);
                uiModel.setProperty(UiState.NODES_DRAGGED, false);
            }

            const selectControl = this.byId("selVariant") as Select;
            if (selectControl) {
                selectControl.setValueState("None");
                selectControl.setValueStateText("");
            }
            
            this.generationHandler.generate(false, false, true); 
            this.updateShareStateUI();
        }
    }

    /**
     * @private
     * @description Extracts the standardized breadcrumb path for the current drill-down state.
     * Crucial for creating unique cache keys to prevent memory collision across different layout tiers.
     * @returns {string} Pipe-separated path string.
     */
    private getBreadcrumbPath(): string {
        const dataModel = this.getView()?.getModel("diagramData") as JSONModel;
        if (!dataModel) return "";
        const links = dataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [];
        const current = dataModel.getProperty(DiagramData.CURRENT_BREADCRUMB) || dataModel.getProperty(DiagramData.CDS_NAME) || "";
        return links.map((l: any) => l.name).concat(current).map((s: string) => s.toUpperCase()).join('|');
    }

    /**
     * @private
     * @description Core drill-down orchestration logic.
     * Evaluates the breadcrumb stack, handles snapshot state caching of the current view, 
     * and safely routes the request to the diagram generator.
     * @param {string} [viewName] - Target entity name.
     * @returns {void}
     */
    private processDrillDown(viewName?: string): void {
        if (!viewName) return;

        const inputField = this.byId("cmbCdsName") as Input;
        const currentCdsName = inputField ? inputField.getValue().trim().toUpperCase() : "";
        const targetCdsName = viewName.toUpperCase();

        const currentPath = this.getBreadcrumbPath();
        const dataModel = this.getView()?.getModel("diagramData") as JSONModel;
        const links = dataModel ? dataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [] : [];
        const index = links.findIndex((l: any) => l.name.toUpperCase() === targetCdsName);
        
        let targetPath = targetCdsName;
        if (index > -1) {
            targetPath = links.slice(0, index + 1).map((l: any) => l.name.toUpperCase()).join('|');
        } else {
            targetPath = (currentPath ? currentPath + '|' : '') + targetCdsName;
        }

        if (currentCdsName && currentCdsName !== targetCdsName) {
            const currentState = VariantStateMapper.captureState(this.getView() as View, currentCdsName, true);
            SessionStateCache.set(this.getInstanceId(), currentPath, currentState);
        }

        const cachedState = SessionStateCache.get(this.getInstanceId(), targetPath);
        if (cachedState) {
            VariantStateMapper.applyState(this.getView() as View, cachedState);
            this.generationHandler.handleDrillDown(viewName, true);
            return;
        }

        this.stateHandler.markDirtyState(true);
        this.generationHandler.handleDrillDown(viewName, false);
    }

    /**
     * @public
     * @description Orchestrates the Share Link generation and clipboard copy mechanism.
     * @returns {Promise<void>}
     */
    public async onShareVariant(): Promise<void> {
        const variantSelect = this.byId("selVariant") as Select;
        const selectedVariantId = variantSelect?.getSelectedKey();

        if (!selectedVariantId) {
            MessageToast.show(this.getText("msgSelectVariantToShare") || "Please select a saved variant to share.");
            return;
        }

        const variantsModel = this.getView()?.getModel("variants") as JSONModel;
        const variants = variantsModel.getProperty("/items") || [];
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
            this.getText("msgShareLinkPrompt") || "Generate a shareable link? (This will not publish it to the global dropdown).",
            {
                title: this.getText("ttShareVariant") || "Share Link",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: async (action: string) => {
                    if (action === MessageBox.Action.YES) {
                        ViewStateHelper.setAppBusy(true, this.getView() as View);
                        try {
                            const odataModel = (this.getView()?.getModel() || this.getOwnerComponent()?.getModel()) as ODataModel;
                            await VariantService.generateShareLink(odataModel, variant.VariantId);
                            (variant as any).isUnlisted = true;
                            variantsModel.refresh(true);
                            this.updateShareStateUI();
                            await this._copyShareLink(variant.VariantId);
                        } catch (error: any) {
                            MessageBox.error(error.message || "Failed to generate share link.");
                        } finally {
                            ViewStateHelper.setAppBusy(false, this.getView() as View);
                        }
                    }
                }
            }
        );
    }

    /**
     * @private
     * @description DRY wrapper to explicitly copy the URL and emit the correct success toast.
     */
    private async _copyShareLink(variantId: string): Promise<void> {
        const shareUrl = await this.generateShareUrl(variantId);
        if (navigator?.clipboard) {
            await navigator.clipboard.writeText(shareUrl);
            MessageToast.show(this.getText("msgLinkCopied") || "Shareable link copied to clipboard!");
        } else {
            MessageBox.information(this.getText("msgLinkGenerated") || "Share Link:", { details: shareUrl });
        }
    }

    /**
     * @private
     * @description Generates a standardized Fiori-compliant shareable URL using CrossApplicationNavigation.
     * Falls back to manual hash manipulation strictly for standalone sandbox environments.
     * @param {string} variantId - The backend UUID of the target variant.
     * @returns {Promise<string>} The absolute URL to the viewer deep link.
     */
    private async generateShareUrl(variantId: string): Promise<string> {
        const baseUrl = window.location.href.split('#')[0];
        let shareHash = "";

        try {
            if (typeof sap !== "undefined" && sap.ushell && (sap.ushell as any).Container) {
                const crossAppNav = await (sap.ushell as any).Container.getServiceAsync("CrossApplicationNavigation");
                let currentHash = window.location.hash;
                if (currentHash.startsWith("#")) currentHash = currentHash.substring(1);
                
                const parsed = crossAppNav.parseShellHash(currentHash);
                if (parsed && parsed.semanticObject && parsed.action) {
                    shareHash = crossAppNav.hrefForExternal({
                        target: {
                            semanticObject: parsed.semanticObject,
                            action: parsed.action
                        },
                        appSpecificRoute: `&/viewer/${variantId}`
                    }) || "";
                }
            }
        } catch (error) {
            // Silently fall back to manual hash building if the shell service is unavailable
        }

        if (!shareHash) {
            let baseHash = window.location.hash.split('?')[0]; 
            if (baseHash.includes('&/')) baseHash = baseHash.split('&/')[0];
            else if (baseHash.includes('/')) baseHash = baseHash.split('/')[0];
            if (!baseHash || baseHash === "#") baseHash = "#VDMDiagram-display"; 
            
            const separator = baseHash.includes("-") ? "&/" : "/";
            shareHash = `${baseHash}${separator}viewer/${variantId}`;
        }

        return shareHash.startsWith("#") ? `${baseUrl}${shareHash}` : `${baseUrl}#${shareHash}`;
    }

    /**
     * @public
     * @description Instantly revokes sharing permissions, reverting the variant to strictly private.
     * @returns {Promise<void>}
     */
    public async onRevokeShare(): Promise<void> {
        const variantSelect = this.byId("selVariant") as Select;
        const selectedVariantId = variantSelect?.getSelectedKey();

        if (!selectedVariantId) return;

        const variantsModel = this.getView()?.getModel("variants") as JSONModel;
        const variants = variantsModel.getProperty("/items") || [];
        const variant = variants.find((v: any) => v.VariantId === selectedVariantId);

        if (!variant || !variant.VariantId) {
            MessageToast.show("Cannot revoke an unsaved variant.");
            return;
        }

        ViewStateHelper.setAppBusy(true, this.getView() as View);

        try {
            const odataModel = (this.getView()?.getModel() || this.getOwnerComponent()?.getModel()) as ODataModel;
            
            await VariantService.revokeShareLink(odataModel, variant.VariantId);
            (variant as any).isUnlisted = false;
            variantsModel.refresh(true);

            this.updateShareStateUI();

            MessageToast.show(this.getText("msgRevokeSuccess") || "Sharing revoked. Variant is now private.");
        } catch (error: any) {
            MessageBox.error(error.message || "Failed to revoke share link.");
        } finally {
            ViewStateHelper.setAppBusy(false, this.getView() as View);
        }
    }

    /**
     * @public
     * @description Value Help request handler for CDS search inputs.
     * @param {Event} e - Value Help event.
     */
    public onCdsValueHelpRequest(e: Event): void { this.uiHandler.onCdsValueHelpRequest(e); }
    
    /**
     * @public
     * @description Handler for the main CDS input live change.
     */
    public onCdsNameChange(): void { this.stateHandler.onCdsNameChange(); }
    
    /**
     * @public
     * @description Form property change handler. Marks the configuration as stale.
     */
    public onFormChange(): void { this.stateHandler.onFormChange(); }
    
    /**
     * @public
     * @description Displays inline contextual popover information for standard settings.
     * @param {Event} e - Button press event.
     */
    public onShowInfo(e: Event): void { this.uiHandler.onShowInfo(e); }

    /**
     * @private
     * @description Safe utility to retrieve translation strings. Fallback to key if missing.
     */
    private getText(key: string, args?: any[]): string {
        const model = this.getOwnerComponent()?.getModel("i18n") as ResourceModel;
        const bundle = model?.getResourceBundle() as ResourceBundle;
        return bundle ? bundle.getText(key, args) || key : key;
    }
}