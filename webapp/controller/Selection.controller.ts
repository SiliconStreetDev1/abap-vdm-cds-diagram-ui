/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Main Selection / Filter UI Controller.
 * @description Manages all Variant state lifecycle workflows and formatting interactions.
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
import DiagramGenerationHandler from "../handlers/state/DiagramGenerationHandler";
import SelectionStateHandler from "../handlers/state/SelectionStateHandler";
import SelectionUIHandler from "../handlers/ui/SelectionUIHandler";
import VariantOrchestrationHandler from "../handlers/state/VariantOrchestrationHandler";
import InputValidationService from "../services/InputValidationService";
import VariantService from "../services/VariantService";
import SearchHistoryService from "../services/SearchHistoryService";
import { ModelNames } from "../constants/StateConstants";
import ContextHelpManager from "../helpers/ContextHelpManager";

export default class Selection extends Controller {

    private variantHandler!: VariantHandler;
    private generationHandler!: DiagramGenerationHandler;
    private stateHandler!: SelectionStateHandler;
    private uiHandler!: SelectionUIHandler;
    private variantOrchestrator!: VariantOrchestrationHandler;

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
     * @description Lifecycle hook: Initializes models, FCL configurations, and generic helpers.
     * Sets up EventManager subscriptions for decoupled cross-pane communication.
     */
    public onInit(): void {
        const view = this.getView();
        if (!view) return;

        this.variantHandler = new VariantHandler(view, this.getText.bind(this));
        this.stateHandler = new SelectionStateHandler(view, this.getText.bind(this));
        
        this.generationHandler = new DiagramGenerationHandler(view, this.getText.bind(this));
        this.uiHandler = new SelectionUIHandler(view, this.stateHandler, this.getText.bind(this));
        this.variantOrchestrator = new VariantOrchestrationHandler(view, this.variantHandler, this.generationHandler, this.getText.bind(this));

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

        this.generationHandler.attachEvents();
        this.uiHandler.attachEvents();
        this.stateHandler.attachEvents();
    }

    /**
     * @public
     * @description Lifecycle hook. Detaches all global DOM listeners and EventBus subscriptions 
     * to prevent aggressive memory leaks when the view is destroyed.
     */
    public onExit(): void {
        this.generationHandler.detachEvents();
        this.uiHandler.detachEvents();
        this.stateHandler.detachEvents();

        ContextHelpManager.destroy(this.getInstanceId());
    }

    // ========================================================================
    // DELEGATED EVENT HANDLERS
    // ========================================================================

    /**
     * @public
     * @description Event handler for the Generate Diagram button.
     */
    public onGenerate(): void { 
        // ENTERPRISE FIX: The manual 'Generate' button should ALWAYS bypass the LRU cache.
        // This allows users to explicitly fetch fresh backend metadata if the ABAP dictionary changed.
        this.generationHandler.generate(false, false, false, true); 
    }

    /**
     * @public
     * @description Event handler for Engine selection change. Triggers format config resets.
     */
    public onEngineChange(e: Event): void { this.uiHandler.onEngineChange(e); }

    /**
     * @public
     * @description Event handler for live formatting property changes (e.g. node spacing sliders).
     */
    public onLiveFormatChange(): void { this.uiHandler.onLiveFormatChange(); }

    /**
     * @public
     * @description Event handler for Relationship mode changes (Lines vs Discovery).
     */
    public onRelModeChange(e: Event): void { this.uiHandler.onRelModeChange(e); }

    public async onSaveVariant(): Promise<void> { await this.variantOrchestrator.saveVariant(); }
    public async onDeleteVariant(): Promise<void> { await this.variantOrchestrator.deleteVariant(); }
    public async onVariantChange(e: Event): Promise<void> { await this.variantOrchestrator.changeVariant(e); }
    public async onRevertVariant(): Promise<void> { await this.variantOrchestrator.revertVariant(); }
    public onClearVariant(): void { this.variantOrchestrator.clearVariant(); }
    public async onShareVariant(): Promise<void> { await this.variantOrchestrator.shareVariant(); }
    public async onRevokeShare(): Promise<void> { await this.variantOrchestrator.revokeShare(); }

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