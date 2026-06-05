/**
 * @fileoverview Encapsulates backend generation logic and breadcrumb state tracking.
 * @description Relieves the controller of OData filtering orchestration and EventBus payload creation.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import EventBus from "sap/ui/core/EventBus";
import MessageToast from "sap/m/MessageToast";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

import DiagramRequestMapper from "../../helpers/DiagramRequestMapper";
import DiagramService from "../../services/DiagramService";
import VariantService from "../../services/VariantService";
import SearchHistoryService from "../../services/SearchHistoryService";
import SessionStateCache from "../../helpers/SessionStateCache";
import ViewStateHelper from "../../helpers/ViewStateHelper";
import { EngineType, IRenderRequestPayload } from "../../types";
import { EventChannels, EventIds } from "../../constants/EventConstants";
import { UiState, ModelNames } from "../../constants/StateConstants";
import Renderer from "../../renderer/Renderer";

export default class DiagramGenerationHandler {
    private view: View;
    private eventBus?: EventBus;
    private getText: (key: string, args?: any[]) => string;
    private rootCdsName: string = "";
    private breadcrumbs: string[] = [];

    /**
     * @public
     * @param {View} view - The active SAPUI5 view.
     * @param {EventBus | undefined} eventBus - The application event bus for decoupled messaging.
     * @param {Function} getText - Translation string delegate.
     */
    constructor(view: View, eventBus: EventBus | undefined, getText: (key: string, args?: any[]) => string) {
        this.view = view;
        this.eventBus = eventBus;
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
     * Performs the entire cycle of validating parameters, querying the ABAP backend,
     * and submitting the processed response payload to the application EventBus.
     * @param {boolean} isDrillDown - Prevents root CDS mutation if this execution is a nested drill-down.
     * @param {boolean} [isRestore=false] - Prevents wiping custom preset positions if restoring from a cached state.
     * @param {boolean} [isVariantApply=false] - Suppresses stale state alerts during variant hydration.
     * @returns {Promise<void>}
     */
    public async generate(isDrillDown: boolean, isRestore: boolean = false, isVariantApply: boolean = false): Promise<void> {
        const inputField = this.view.byId("cmbCdsName") as Input;
        const cdsName = inputField.getValue().trim().toUpperCase();

        if (!cdsName) {
            MessageToast.show(this.getText("msgEnterCds"));
            return;
        }

        const uiModel = this.view.getModel(ModelNames.UI) as JSONModel;
        const lastCdsName = uiModel.getProperty(UiState.LAST_GENERATED_CDS);
        const engine = ((this.view.byId("selEngine") as Select)?.getSelectedKey() || Renderer.getDefaultEngine()) as EngineType;
        
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

        if (!isDrillDown) {
            this.rootCdsName = cdsName;
            this.breadcrumbs = [cdsName];
            SessionStateCache.clear(this.getInstanceId()); 
        } else {
            const index = this.breadcrumbs.indexOf(cdsName);
            if (index > -1) {
                for (let k = index + 1; k < this.breadcrumbs.length; k++) {
                    const orphanPath = this.breadcrumbs.slice(0, k + 1).join('|');
                    SessionStateCache.remove(this.getInstanceId(), orphanPath);
                }
                this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
            } else {
                this.breadcrumbs.push(cdsName);
            }
        }

        // ENTERPRISE FIX: Aggressively resolve the OData V4 model. 
        // Fiori occasionally delays downward model propagation during direct URL access.
        const odataModel = (this.view.getModel() || this.view.getController()?.getOwnerComponent()?.getModel()) as ODataModel;
        if (!odataModel) {
            MessageToast.show(this.getText("msgReqFailed", ["OData connection not established."]));
            return;
        }

        uiModel.setProperty(UiState.IS_CANVAS_STALE, false);

        if (this.eventBus) {
            this.eventBus.publish(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_AUTO_PAUSE);
        }

        ViewStateHelper.setAppBusy(true, this.view, true);

        try {
            // ENTERPRISE FIX: Validate CDS existence via the Search endpoint before triggering expensive rendering operations.
            const searchBinding = odataModel.bindList("/Search", undefined, undefined, [
                new Filter("CdsName", FilterOperator.EQ, cdsName)
            ]);
            const searchContexts = await searchBinding.requestContexts(0, 1);
            searchBinding.destroy();
            
            if (searchContexts.length === 0) {
                throw new Error("msgNoMeta");
            }

            const request = DiagramRequestMapper.buildRequest(this.view, cdsName, engine);
            const result = await DiagramService.fetchDiagram(odataModel, request);

            SearchHistoryService.updateHistory(result.CdsName);
            (this.view.getModel(ModelNames.HISTORY) as JSONModel).setProperty("/items", SearchHistoryService.getHistory());

            if (this.eventBus) {
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
                this.eventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, payload);
            }
            
        } catch (error: any) {
            uiModel.setProperty(UiState.IS_CANVAS_STALE, true);
            
            if (this.eventBus) {
                this.eventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_FAILED, { message: error.message });
                this.eventBus.publish(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_AUTO_RESUME);
            }
            
            MessageToast.show(this.getText(error.message) || error.message);
        } finally {
            ViewStateHelper.setAppBusy(false, this.view);
        }
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
            (this.view.byId("cmbCdsName") as Input).setValue(viewName);
            this.generate(true, isRestore);
        }
    }
}
