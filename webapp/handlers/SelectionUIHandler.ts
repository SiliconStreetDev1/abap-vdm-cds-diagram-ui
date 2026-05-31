/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates minor UI interactions like popovers, value-help formatting, and form live-updates.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import EventBus from "sap/ui/core/EventBus";
import Control from "sap/ui/core/Control";
import Icon from "sap/ui/core/Icon";
import VBox from "sap/m/VBox";
import Input from "sap/m/Input";
import ComboBox from "sap/m/ComboBox";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import Button from "sap/m/Button";
import ViewStateHelper from "../helpers/ViewStateHelper";
import SelectionStateHandler from "./SelectionStateHandler";
import CdsValueHelpHandler from "./CdsValueHelpHandler";
import ContextHelpManager from "../helpers/ContextHelpManager";
import { EngineType } from "../types";
import { EventChannels, EventIds } from "../constants/EventConstants";

export default class SelectionUIHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _oStateHandler: SelectionStateHandler;
    private _fnGetText: (k: string, args?: any[]) => string;
    private _oCdsValueHelpHandler?: CdsValueHelpHandler;
    private _oActiveSearchField?: Control;

    constructor(oView: View, oEventBus: EventBus | undefined, oStateHandler: SelectionStateHandler, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._oEventBus = oEventBus;
        this._oStateHandler = oStateHandler;
        this._fnGetText = fnGetText;
    }

    /**
     * @public
     * @description Syncs format configurations when switching rendering engines.
     * @param {Event} oEvent - The combo box change event.
     * @returns {void}
     */
    public onEngineChange(oEvent: Event): void {
        ViewStateHelper.handleEngineChange(oEvent, this._oView.getModel("ui") as JSONModel);
        this._oStateHandler.onFormChange();
    }

    /**
     * @public
     * @description Dynamically applies local style modifications directly to the engine without refetching data.
     * @returns {void}
     */
    public onLiveFormatChange(): void {
        this._oStateHandler.markDirtyState(false);
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const sEngine = oUiModel.getProperty("/activeEngine") || "";

        if (sEngine === EngineType.CYTOSCAPE || String(sEngine).toUpperCase() === "CYTOSCAPE") {
            const oFormatConfig = Object.assign({}, oUiModel.getProperty("/formatCytoscape"));
            if (this._oEventBus) {
                this._oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.LIVE_FORMAT_UPDATE, { engine: EngineType.CYTOSCAPE, format: oFormatConfig });
            }
        } else {
            // Other engines require a full rendering cycle for format changes
            this._oStateHandler.markStaleState();
        }
    }

    /**
     * @public
     * @description Switches layout controls when transitioning between physical paths and Discovery mode.
     * @param {Event} oEvent - SegButton change event.
     * @returns {void}
     */
    public onRelModeChange(oEvent: Event): void {
        ViewStateHelper.toggleRelMode(oEvent, this._oView.byId("boxLines") as VBox, this._oView.byId("boxDiscovery") as VBox);
        this._oStateHandler.onFormChange();
    }

    /**
     * @public
     * @description Broadcasts layout node spacing changes.
     * @param {any} oEvent - UI Custom Slider Event.
     * @returns {void}
     */
    public onSliderUpdate(oEvent: CustomEvent): void {
        if (oEvent.detail?.node_spacing) (this._oView.getModel("ui") as JSONModel)?.setProperty("/formatCytoscape/node_spacing", oEvent.detail.node_spacing);
    }

    /**
     * @public
     * @description Dispatches standard Fiori contextual popovers on Help (i) icon interaction.
     * @param {Event} oEvent - UI Button press event.
     * @returns {void}
     */
    public onShowInfo(oEvent: Event): void {
        ContextHelpManager.openPopover(oEvent, this._oView, this._fnGetText);
    }

    /**
     * @public
     * @description Initializes the Search Fragment overlay and triggers its payload sequence.
     * @param {Event} oEvent - F4 / Value Help Request event.
     * @returns {void}
     */
    public onCdsValueHelpRequest(oEvent: Event): void {
        this._oActiveSearchField = oEvent.getSource() as Control;
        if (!this._oCdsValueHelpHandler) this._oCdsValueHelpHandler = new CdsValueHelpHandler(this._oView, (s: string) => this._processValueHelpSelection(s));
        this._oCdsValueHelpHandler.open();
    }

    /**
     * @private
     * @description Processes and validates the target CDS entity requested via the Value Help Dialog.
     * @param {string} sSelectedCds - Standardized Entity Name string.
     * @returns {void}
     */
    private _processValueHelpSelection(sSelectedCds: string): void {
        const oActiveField = this._oActiveSearchField as any;
        if (!oActiveField) return;
        if (oActiveField.isA("sap.m.MultiInput")) {
            const oMI = oActiveField as MultiInput;
            if (!oMI.getTokens().some((t: Token) => t.getKey() === sSelectedCds)) oMI.addToken(new Token({ key: sSelectedCds, text: sSelectedCds }));
            oMI.focus();
            this._oStateHandler.onFormChange();
        } else if (oActiveField.isA("sap.m.Input") || oActiveField.isA("sap.m.ComboBox")) {
            const oInputField = oActiveField as Input | ComboBox;
            oInputField.setValue(sSelectedCds);
            (this._oView.byId("btnGenerate") as Button)?.focus();
            this._oStateHandler.onCdsNameChange();
        }
        this._oActiveSearchField = undefined;
    }
}