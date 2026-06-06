/**
 * @fileoverview Encapsulates backend generation logic and breadcrumb state tracking.
 * @description Relieves the controller of OData filtering orchestration and EventBus payload creation.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { EventManager } from "../../events/EventManager";
import { Subscription } from "../../events/Subscription";
import MessageToast from "sap/m/MessageToast";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

import DiagramRequestMapper from "../../helpers/DiagramRequestMapper";
import DiagramService from "../../services/DiagramService";
import VariantService from "../../services/VariantService";
import SearchHistoryService from "../../services/SearchHistoryService";
import { DiagramStateStore } from "../../store/DiagramStateStore";
import DiagramCache from "../../services/DiagramCache";
import ViewStateHelper from "../../helpers/ViewStateHelper";
import { EngineType, IRenderRequestPayload } from "../../types";
import { UiState, ModelNames, DiagramData } from "../../constants/StateConstants";
import Renderer from "../../renderer/Renderer";
import VariantStateMapper from "../../helpers/VariantStateMapper";

export default class DiagramGenerationHandler {
    private view: View;
    private subscriptions: Subscription[] = [];
    private getText: (key: string, args?: any[]) => string;
    private rootCdsName: string = "";
    private breadcrumbs: string[] = [];
    private _fnNodeDrillDownRequestBind!: any;
    private _bIsAttached: boolean = false;

    /**
     * @public
     * @param {View} view - The active SAPUI5 view.
     * @param {Function} getText - Translation string delegate.
     */
    constructor(view: View, getText: (key: string, args?: any[]) => string) {
        this.view = view;
        this.getText = getText;
    }

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private getInstanceId(): string {
        return this.view.getController()?.getOwnerComponent()?.getId() || this.view.getId();
    }

    /**
     * @public
     * @description Attaches custom DOM and EventBus listeners required for generation cycles.
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;
        this.subscriptions.push(EventManager.getInstance().subscribe("diagram:nodeDrillDown", this._onEventBusDrillDown.bind(this)));
        this.subscriptions.push(EventManager.getInstance().subscribe("diagram:applyVariantState", this._restoreWorkspaceState.bind(this)));
        this._fnNodeDrillDownRequestBind = this._onNodeDrillDownDOM.bind(this) as any;
        this.subscriptions.push(EventManager.getInstance().subscribe("canvas:nodeDrillDownRequest", this._fnNodeDrillDownRequestBind));
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches custom DOM and EventBus listeners to prevent memory leaks during component destruction.
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];
        /* removed */
        this._bIsAttached = false;
    }

    /**
     * @public
     * Performs the entire cycle of validating parameters, querying the ABAP backend,
     * and submitting the processed response payload to the application EventBus.
     * @param {boolean} isDrillDown - Prevents root CDS mutation if this execution is a nested drill-down.
     * @param {boolean} [isRestore=false] - Prevents wiping custom preset positions if restoring from a cached state.
     * @param {boolean} [isVariantApply=false] - Suppresses stale state alerts during variant hydration.
     * @param {boolean} [forceRefresh=false] - Explicitly bypasses the DiagramCache to fetch fresh data from the backend.
     * @returns {Promise<void>}
     */
    public async generate(isDrillDown: boolean, isRestore: boolean = false, isVariantApply: boolean = false, forceRefresh: boolean = false): Promise<void> {
        const inputField = this.view.byId("cmbCdsName") as Input;
        const cdsName = inputField.getValue().trim().toUpperCase();

        if (!cdsName) {
            MessageToast.show(this.getText("msgEnterCds"));
            return;
        }

        const engine = ((this.view.byId("selEngine") as Select)?.getSelectedKey() || Renderer.getDefaultEngine()) as EngineType;
        
        this._updateUiStateBeforeGeneration(cdsName, engine, isRestore, isVariantApply);
        this._manageBreadcrumbHierarchy(cdsName, isDrillDown);

        // ENTERPRISE FIX: Aggressively resolve the OData V4 model. 
        // Fiori occasionally delays downward model propagation during direct URL access.
        const odataModel = (this.view.getModel() || this.view.getController()?.getOwnerComponent()?.getModel()) as ODataModel;
        if (!odataModel) {
            MessageToast.show(this.getText("msgReqFailed", ["OData connection not established."]));
            return;
        }

        EventManager.getInstance().publish("video:autoPause", undefined);

        const request = DiagramRequestMapper.buildRequest(this.view, cdsName, engine);
        const cachedResult = forceRefresh ? null : DiagramCache.get(request);

        // ENTERPRISE UX: Suppress the busy dialog and Fiori blocking if the payload is already in RAM.
        if (!cachedResult) {
            ViewStateHelper.setAppBusy(true, this.view, true);
        }

        try {
            const result = await this._fetchDiagramData(odataModel, request, cdsName, forceRefresh, cachedResult);

            SearchHistoryService.updateHistory(result.CdsName);
            (this.view.getModel(ModelNames.HISTORY) as JSONModel).setProperty("/items", SearchHistoryService.getHistory());

            this._publishRenderEvent(result, engine, isRestore);
            
        } catch (error: any) {
            (this.view.getModel(ModelNames.UI) as JSONModel).setProperty(UiState.IS_CANVAS_STALE, true);
            
            EventManager.getInstance().publish("diagram:renderFailed", { message: error.message });
            EventManager.getInstance().publish("video:autoResume", undefined);
            
            MessageToast.show(this.getText(error.message) || error.message);
        } finally {
            ViewStateHelper.setAppBusy(false, this.view);
        }
    }

    /**
     * @private
     * @description Prepares the UI model state before diagram generation, clearing specific layout parameters if moving between distinct views.
     * @param {string} cdsName - Target CDS view name.
     * @param {EngineType} engine - Selected rendering engine.
     * @param {boolean} isRestore - Whether this generation is restoring a known layout.
     * @param {boolean} isVariantApply - Whether this generation is strictly applying a variant.
     */
    private _updateUiStateBeforeGeneration(cdsName: string, engine: EngineType, isRestore: boolean, isVariantApply: boolean): void {
        const uiModel = this.view.getModel(ModelNames.UI) as JSONModel;
        const lastCdsName = uiModel.getProperty(UiState.LAST_GENERATED_CDS);
        
        if (lastCdsName && lastCdsName !== cdsName && !isRestore && !isVariantApply) {
            if (engine && Renderer.supportsStateCapture(engine)) {
                const modelData = uiModel.getData();
                const formatKey = Object.keys(modelData).find(key => key.toUpperCase() === `FORMAT${engine}`);
                if (formatKey) {
                    uiModel.setProperty(`/${formatKey}/presetPositions`, null);
                    if (uiModel.getProperty(`/${formatKey}/layout_algorithm`) === "preset") {
                        uiModel.setProperty(`/${formatKey}/layout_algorithm`, "dagre");
                    }
                }
            }
        }
        uiModel.setProperty(UiState.LAST_GENERATED_CDS, cdsName);
        uiModel.setProperty(UiState.IS_CANVAS_STALE, false);
    }

    /**
     * @private
     * @description Maintains the breadcrumb trail stack and memory cache logic during standard and drill-down generations.
     * @param {string} cdsName - Target CDS view name.
     * @param {boolean} isDrillDown - Whether the generation is a child drill-down operation.
     */
    private _manageBreadcrumbHierarchy(cdsName: string, isDrillDown: boolean): void {
        if (!isDrillDown) {
            this.rootCdsName = cdsName;
            this.breadcrumbs = [cdsName];
            DiagramStateStore.getInstance().clearDiagramState(this.getInstanceId()); 
        } else {
            const index = this.breadcrumbs.indexOf(cdsName);
            if (index > -1) {
                for (let k = index + 1; k < this.breadcrumbs.length; k++) {
                    const orphanCds = this.breadcrumbs[k];
                    DiagramStateStore.getInstance().clearDiagramState(this.getInstanceId(), orphanCds);
                }
                this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
            } else {
                this.breadcrumbs.push(cdsName);
            }
        }
    }

    /**
     * @private
     * @description Fetches or validates diagram data from the OData service.
     * @param {ODataModel} odataModel - OData V4 Model.
     * @param {any} request - Prepared DTO request.
     * @param {string} cdsName - Target CDS view name.
     * @param {boolean} forceRefresh - True to bypass LRU cache.
     * @param {any} cachedResult - Existing cached payload if available.
     * @returns {Promise<any>} Raw backend response payload.
     */
    private async _fetchDiagramData(odataModel: ODataModel, request: any, cdsName: string, forceRefresh: boolean, cachedResult: any): Promise<any> {
        if (cachedResult) {
            return cachedResult;
        }

        // ENTERPRISE FIX: Validate CDS existence via the Search endpoint before triggering expensive rendering operations.
        const bExists = await DiagramService.validateCds(odataModel, cdsName);
        if (!bExists) {
            throw new Error("msgNoMeta");
        }

        return await DiagramService.fetchDiagram(odataModel, request, forceRefresh);
    }

    /**
     * @private
     * @description Publishes the completed diagram payload to the local EventBus for the active rendering engine to ingest and process.
     * @param {any} result - OData backend response payload.
     * @param {EngineType} engine - Selected rendering engine.
     * @param {boolean} isRestore - True if restoring a layout snapshot.
     */
    private _publishRenderEvent(result: any, engine: EngineType, isRestore: boolean): void {
        const uiModel = this.view.getModel(ModelNames.UI) as JSONModel;
        const payload: IRenderRequestPayload = {
            payload: result.DiagramPayload, 
            extension: result.FileExtension, 
            cdsName: result.CdsName,
            engine: engine, 
            rootCdsName: this.rootCdsName, 
            breadcrumbs: this.breadcrumbs
        };
        
        const modelData = uiModel.getData();
        const formatKey = Object.keys(modelData).find(key => key.toUpperCase() === `FORMAT${engine}`);
        if (formatKey) {
            payload.engineConfig = Object.assign({}, uiModel.getProperty(`/${formatKey}`));
            payload.engineConfig.isRestore = isRestore;
        }
        EventManager.getInstance().publish("diagram:renderRequest", payload);
    }

    /**
     * @public
     * @description Updates the contextual CDS field and reroutes to the standard diagram generator.
     * @param {string} [viewName] - The entity name specified during a drill down attempt.
     * @param {boolean} [isRestore=false] - Whether this navigation is restoring a previously cached layout state.
     * @returns {void}
     */
    public handleDrillDown(viewName?: string, isRestore: boolean = false): void {
        if (viewName) {
            const uiModel = this.view.getModel(ModelNames.UI) as JSONModel;
            const currentCds = uiModel.getProperty(UiState.LAST_GENERATED_CDS);
            
            if (currentCds && !isRestore) {
                const currentState = VariantStateMapper.captureState(this.view, currentCds, true);
                DiagramStateStore.getInstance().setVariantState(this.getInstanceId(), currentCds, currentState);
            }

            if (isRestore) {
                const cachedState = DiagramStateStore.getInstance().getVariantState(this.getInstanceId(), viewName);
                if (cachedState) {
                    VariantStateMapper.applyState(this.view, cachedState);
                }
            }

            (this.view.byId("cmbCdsName") as Input).setValue(viewName);
            this.generate(true, isRestore, false, false);
        }
    }

    /**
     * @private
     * @description EventBus listener for drill-down commands broadcasted across separated components.
     */
    private _onEventBusDrillDown(data: any): void {
        this.processDrillDown(data?.viewName);
    }

    /**
     * @private
     * @description DOM event listener intercepting Cytoscape native click-to-drill events from the Canvas.
     * @param {globalThis.Event} e - Native DOM Event.
     */
    private _onNodeDrillDownDOM(e: globalThis.Event): void {
        const payload = e as any;
        if (payload?.viewId && payload.viewId !== this.getInstanceId()) return;
        this.processDrillDown(payload?.viewName as string);
    }

    /**
     * @private
     * @description EventBus listener for workspace clone and variant restoration events.
     * Safely injects the targeted CDS name, binds the saved configuration to the Fiori UI Model,
     * and executes the diagram generation cycle.
     */
    private async _restoreWorkspaceState(oState: any): Promise<void> {
        const variantState = oState;
        if (variantState.cdsName) {
            (this.view.byId("cmbCdsName") as Input).setValue(variantState.cdsName);
        }
        VariantStateMapper.applyState(this.view, variantState);
        await this.generate(false, true, true);
    }

    /**
     * @private
     * @description Extracts the standardized breadcrumb path for the current drill-down state.
     * Crucial for creating unique cache keys to prevent memory collision across different layout tiers.
     * @returns {string} Pipe-separated path string.
     */
    private _getBreadcrumbPath(): string {
        const dataModel = this.view.getModel("diagramData") as JSONModel;
        if (!dataModel) return "";
        const links = dataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [];
        const current = dataModel.getProperty(DiagramData.CURRENT_BREADCRUMB) || dataModel.getProperty(DiagramData.CDS_NAME) || "";
        return links.map((l: any) => l.name).concat(current).map((s: string) => s.toUpperCase()).join('|');
    }

    /**
     * @public
     * @description Core drill-down orchestration logic. Evaluates the breadcrumb stack, 
     * handles snapshot state caching of the current view, and safely routes the request to the diagram generator.
     * @param {string} [viewName] - Target entity name.
     * @returns {void}
     */
    public processDrillDown(viewName?: string): void {
        if (!viewName) return;
        const inputField = this.view.byId("cmbCdsName") as Input;
        const currentCdsName = inputField ? inputField.getValue().trim().toUpperCase() : "";
        const targetCdsName = viewName.toUpperCase();
        const currentPath = this._getBreadcrumbPath();
        const dataModel = this.view.getModel("diagramData") as JSONModel;
        const links = dataModel ? dataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [] : [];
        const index = links.findIndex((l: any) => l.name.toUpperCase() === targetCdsName);
        const targetPath = index > -1 ? links.slice(0, index + 1).map((l: any) => l.name.toUpperCase()).join('|') : (currentPath ? currentPath + '|' : '') + targetCdsName;

        if (currentCdsName && currentCdsName !== targetCdsName) {
            const currentState = VariantStateMapper.captureState(this.view, currentCdsName, true);
            DiagramStateStore.getInstance().setVariantState(this.getInstanceId(), currentPath, currentState);
        }
        const cachedState = DiagramStateStore.getInstance().getVariantState(this.getInstanceId(), targetPath);
        if (cachedState) {
            VariantStateMapper.applyState(this.view, cachedState);
            this.handleDrillDown(viewName, true);
            return;
        }
        const uiModel = this.view.getModel(ModelNames.UI) as JSONModel;
        if (uiModel) uiModel.setProperty(UiState.VARIANT_DIRTY, true);
        this.handleDrillDown(viewName, false);
    }
}
