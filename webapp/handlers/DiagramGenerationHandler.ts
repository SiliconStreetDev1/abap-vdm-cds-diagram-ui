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

export default class DiagramGenerationHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _fnGetText: (k: string, args?: any[]) => string;
    private _sRootCdsName: string = "";
    private _aBreadcrumbs: string[] = [];

    constructor(oView: View, oEventBus: EventBus | undefined, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._oEventBus = oEventBus;
        this._fnGetText = fnGetText;
    }

    /**
     * @public
     * @description Performs the entire cycle of validating parameters, querying the ABAP backend,
     * and submitting the processed response payload to the application EventBus.
     * @param {boolean} bIsDrillDown - Prevents root CDS mutation if this execution is a nested drill-down.
     * @returns {Promise<void>}
     */
    public async generate(bIsDrillDown: boolean): Promise<void> {
        const oComboBox = this._oView.byId("cmbCdsName") as ComboBox;
        const sCdsName = oComboBox.getValue().trim().toUpperCase();

        if (!sCdsName) {
            MessageToast.show(this._fnGetText("msgEnterCds"));
            return;
        }

        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const sLastCdsName = oUiModel.getProperty("/lastGeneratedCdsName");
        if (sLastCdsName && sLastCdsName !== sCdsName) {
            oUiModel.setProperty("/formatCytoscape/presetPositions", null);
            if (oUiModel.getProperty("/formatCytoscape/layout_algorithm") === "preset") {
                oUiModel.setProperty("/formatCytoscape/layout_algorithm", "dagre");
            }
        }
        oUiModel.setProperty("/lastGeneratedCdsName", sCdsName);

        if (!bIsDrillDown) {
            this._sRootCdsName = sCdsName;
            this._aBreadcrumbs = [sCdsName];
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
     * @returns {void}
     */
    public handleDrillDown(sViewName?: string): void {
        if (sViewName) {
            (this._oView.byId("cmbCdsName") as ComboBox).setValue(sViewName);
            this.generate(true);
        }
    }
}