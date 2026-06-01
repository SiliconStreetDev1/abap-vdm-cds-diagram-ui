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

import DiagramRequestMapper from "../helpers/DiagramRequestMapper";
import DiagramService from "../services/DiagramService";
import VariantManager from "../helpers/VariantManager";
import { EngineType, IRenderRequestPayload } from "../types";
import { EventChannels, EventIds } from "../constants/EventConstants";
import { IVariantState } from "../types/IVariantState";
import Renderer from "../renderer/Renderer";

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
        const sEngine = (this._oView.byId("selEngine") as Select).getSelectedKey() as EngineType;
        
        // Only wipe layout presets if we are navigating to a new view WITHOUT a cached restore state
        if (sLastCdsName && sLastCdsName !== sCdsName && !bIsRestore) {
            if (sEngine && Renderer.supportsStateCapture(sEngine)) {
                const oModelData = oUiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
                if (sFormatKey) {
                    oUiModel.setProperty(`/${sFormatKey}/presetPositions`, null);
                    oUiModel.setProperty(`/${sFormatKey}/camera`, null);
                    if (oUiModel.getProperty(`/${sFormatKey}/layout_algorithm`) === "preset") {
                        oUiModel.setProperty(`/${sFormatKey}/layout_algorithm`, "dagre");
                    }
                }
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

        const oModel = this._oView.getModel() as ODataModel;

        // Eagerly drop the stale state so the UI doesn't flash yellow behind the BusyIndicator
        oUiModel.setProperty("/isCanvasStale", false);

        BusyIndicator.show(0);

        try {
            const oRequest = DiagramRequestMapper.buildRequest(this._oView, sCdsName, sEngine);
            const oResult = await DiagramService.fetchDiagram(oModel, oRequest);

            VariantManager.updateHistory(oResult.CdsName);
            (this._oView.getModel("history") as JSONModel).setProperty("/items", VariantManager.getHistory());

            if (this._oEventBus) {
                const oPayload: IRenderRequestPayload = {
                    payload: oResult.DiagramPayload, extension: oResult.FileExtension, cdsName: oResult.CdsName,
                    engine: sEngine, rootCdsName: this._sRootCdsName, breadcrumbs: this._aBreadcrumbs
                };
                
                const oModelData = oUiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
                if (sFormatKey) {
                    oPayload.engineConfig = Object.assign({}, oUiModel.getProperty(`/${sFormatKey}`));
                }
                this._oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, oPayload);
            }
            
        } catch (oError: any) {
            // Restore the stale state if the diagram generation failed to complete
            oUiModel.setProperty("/isCanvasStale", true);
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