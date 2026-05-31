/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates backend generation logic and breadcrumb state tracking.
 * @description Relieves the controller of OData filtering orchestration and EventBus payload creation.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import EventBus from "sap/ui/core/EventBus";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import ComboBox from "sap/m/ComboBox";
import Select from "sap/m/Select";

import FilterBuilder from "../helpers/FilterBuilder";
import DiagramService from "../services/DiagramService";
import VariantManager from "../helpers/VariantManager";
import { EngineType, IRenderRequestPayload } from "../types";
import { EventChannels, EventIds } from "../constants/EventConstants";
import { IVariantState } from "../types/IVariantState";

export default class DiagramGenerationHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _fnGetText: (k: string, args?: any[]) => string;
    private _sRootCdsName: string = "";
    private _aBreadcrumbs: string[] = [];
    private _oSessionCache: Record<string, IVariantState> = {};

    constructor(oView: View, oEventBus: EventBus | undefined, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._oEventBus = oEventBus;
        this._fnGetText = fnGetText;
    }

    /**
     * @public
     * @description Caches a snapshot of the current view's state for seamless breadcrumb restoration.
     * @param {string} sName - The CDS view name.
     * @param {IVariantState} oState - The captured canvas and filter state.
     */
    public cacheSessionState(sName: string, oState: IVariantState): void {
        this._oSessionCache[sName.toUpperCase()] = oState;
    }

    /**
     * @public
     * @description Retrieves a cached snapshot for a given CDS view, if one exists in this session.
     * @param {string} sName - The CDS view name.
     * @returns {IVariantState | undefined}
     */
    public getCachedSessionState(sName: string): IVariantState | undefined {
        return this._oSessionCache[sName.toUpperCase()];
    }

    public clearSessionCache(): void {
        this._oSessionCache = {};
    }

    /**
     * @public
     * @description Performs the entire cycle of validating parameters, querying the ABAP backend,
     * and submitting the processed response payload to the application EventBus.
     * @param {boolean} bIsDrillDown - Prevents root CDS mutation if this execution is a nested drill-down.
     * @param {boolean} bIsRestore - Prevents wiping custom preset positions if restoring from a cached state.
     * @returns {Promise<void>}
     */
    public async generate(bIsDrillDown: boolean, bIsRestore: boolean = false): Promise<void> {
        const oComboBox = this._oView.byId("cmbCdsName") as ComboBox;
        const sCdsName = oComboBox.getValue().trim().toUpperCase();

        if (!sCdsName) {
            MessageToast.show(this._fnGetText("msgEnterCds"));
            return;
        }

        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const sLastCdsName = oUiModel.getProperty("/lastGeneratedCdsName");
        
        // Only wipe layout presets if we are navigating to a new view WITHOUT a cached restore state
        if (sLastCdsName && sLastCdsName !== sCdsName && !bIsRestore) {
            oUiModel.setProperty("/formatCytoscape/presetPositions", null);
            if (oUiModel.getProperty("/formatCytoscape/layout_algorithm") === "preset") {
                oUiModel.setProperty("/formatCytoscape/layout_algorithm", "dagre");
            }
        }
        oUiModel.setProperty("/lastGeneratedCdsName", sCdsName);

        if (!bIsDrillDown) {
            this._sRootCdsName = sCdsName;
            this._aBreadcrumbs = [sCdsName];
            this.clearSessionCache(); // Reset the snapshot memory on completely new searches
        } else {
            const iIndex = this._aBreadcrumbs.indexOf(sCdsName);
            if (iIndex > -1) {
                this._aBreadcrumbs = this._aBreadcrumbs.slice(0, iIndex + 1);
            } else {
                this._aBreadcrumbs.push(sCdsName);
            }
        }

        const sEngine = (this._oView.byId("selEngine") as Select).getSelectedKey() as EngineType;
        const oModel = this._oView.getModel() as ODataModel;

        BusyIndicator.show(0);

        try {
            const aFilters = FilterBuilder.buildFiltersFromView(this._oView, sCdsName, sEngine);
            const oResult = await DiagramService.fetchDiagram(oModel, aFilters);

            VariantManager.updateHistory(oResult.CdsName);
            (this._oView.getModel("history") as JSONModel).setProperty("/items", VariantManager.getHistory());

            if (this._oEventBus) {
                const oPayload: IRenderRequestPayload = {
                    payload: oResult.DiagramPayload, extension: oResult.FileExtension, cdsName: oResult.CdsName,
                    engine: sEngine, rootCdsName: this._sRootCdsName, breadcrumbs: this._aBreadcrumbs
                };
                
                if (sEngine === EngineType.CYTOSCAPE) {
                    oPayload.engineConfig = oUiModel.getProperty("/formatCytoscape");
                }
                this._oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, oPayload);
            }
            
            // Clear the stale state since the canvas is now perfectly in sync
            oUiModel.setProperty("/isCanvasStale", false);
            
        } catch (oError: any) {
            MessageToast.show(this._fnGetText(oError.message) || oError.message);
        } finally {
            BusyIndicator.hide();
        }
    }

    /**
     * @public
     * @description Updates the contextual CDS field and reroutes to the standard diagram generator.
     * @param {string} [sViewName] - The entity name specified during a drill down attempt.
     * @param {boolean} [bIsRestore=false] - Whether this navigation is restoring a previously cached state.
     * @returns {void}
     */
    public handleDrillDown(sViewName?: string, bIsRestore: boolean = false): void {
        if (sViewName) {
            (this._oView.byId("cmbCdsName") as ComboBox).setValue(sViewName);
            this.generate(true, bIsRestore);
        }
    }
}