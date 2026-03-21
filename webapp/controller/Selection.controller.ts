/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Selection Controller for capturing user input.
 * @version 2.0
 * @description Manages configuration state, calls the backend service, and broadcasts 
 * the payload via the EventBus. It has zero knowledge of the Diagram canvas.
 */

import Controller from "sap/ui/core/mvc/Controller";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";

import ComboBox from "sap/m/ComboBox";
import Select from "sap/m/Select";
import Button from "sap/m/Button";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import VBox from "sap/m/VBox";
import Icon from "sap/ui/core/Icon"; 
import ResponsivePopover from "sap/m/ResponsivePopover";
import Text from "sap/m/Text";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

import FilterBuilder from "../helpers/FilterBuilder";
import ViewStateHelper from "../helpers/ViewStateHelper";
import VariantHandler from "./VariantHandler";
import CdsValueHelpHandler from "./CdsValueHelpHandler";
import DiagramService from "../services/DiagramService";
import InputValidationService from "../services/InputValidationService";

export default class Selection extends Controller {

    /** @private {VariantHandler} Manages configuration layouts */
    private _oVariantHandler!: VariantHandler;
    
    /** @private {CdsValueHelpHandler | undefined} Dialog manager for F4 search */
    private _oCdsValueHelpHandler?: CdsValueHelpHandler;
    
    /** @private {Control | undefined} Tracks the field triggering F4 */
    private _oActiveSearchField?: Control;
    
    /** @private {ResponsivePopover | undefined} Popover instance for inline help */
    private _oInfoPopover?: ResponsivePopover;

    /**
     * @public
     * @description Bootstraps local handlers and input validators.
     * @returns {void}
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        this._oVariantHandler = new VariantHandler(oView, this._getText.bind(this));

        const oIncInput = this.byId("inpInclude") as MultiInput;
        const oExcInput = this.byId("inpExclude") as MultiInput;
        const fnWarn = (sKey: string) => MessageToast.show(this._getText(sKey));
        
        const fnTokenValidator = InputValidationService.buildTokenValidator(oIncInput, oExcInput, fnWarn);
        oIncInput.addValidator(fnTokenValidator);
        oExcInput.addValidator(fnTokenValidator);

        this._oVariantHandler.loadHistoryAndVariants();
    }

    /**
     * @public
     * @description Validates input, requests payload, and publishes to EventBus.
     * @returns {Promise<void>}
     */
    public async onGenerate(): Promise<void> {
        const oComboBox = this.byId("cmbCdsName") as ComboBox;
        const sCdsName = oComboBox.getValue().trim().toUpperCase();
        
        if (!sCdsName) {
            MessageToast.show(this._getText("msgEnterCds"));
            return;
        }

        const sEngine = (this.byId("selEngine") as Select).getSelectedKey();
        const oModel = this.getOwnerComponent()?.getModel() as ODataModel; 
        
        BusyIndicator.show(0);

        try {
            const aFilters = FilterBuilder.buildFiltersFromView(this.getView()!, sCdsName, sEngine);
            const oResult = await DiagramService.fetchDiagram(oModel, aFilters);
            
            this._oVariantHandler.updateHistory(oResult.CdsName);
            DiagramService.validatePayloadSize(oResult.DiagramPayload);

            // PUBLISH TO EVENTBUS
            const oEventBus = this.getOwnerComponent()?.getEventBus();
            if (oEventBus) {
                oEventBus.publish("DiagramEngine", "RenderRequest", {
                    payload: oResult.DiagramPayload,
                    extension: oResult.FileExtension,
                    cdsName: oResult.CdsName,
                    engine: sEngine
                });
            }

        } catch (oError: any) {
            MessageToast.show(this._getText(oError.message) || oError.message);
        } finally {
            BusyIndicator.hide();
        }
    }

    public onEngineChange(oEvent: Event): void {
        const oUiModel = this.getView()?.getModel("ui") as JSONModel;
        ViewStateHelper.handleEngineChange(oEvent, oUiModel);
    }

    public onRelModeChange(oEvent: Event): void {
        const oBoxLines = this.byId("boxLines") as VBox;
        const oBoxDiscovery = this.byId("boxDiscovery") as VBox;
        ViewStateHelper.toggleRelMode(oEvent, oBoxLines, oBoxDiscovery);
    }

    public onSaveVariant(): void         { this._oVariantHandler.openSaveDialog(); }
    public onDeleteVariant(): void       { this._oVariantHandler.deleteSelected(); }
    public onVariantChange(e: Event): void { this._oVariantHandler.applyVariant(e); }

    public onCdsValueHelpRequest(oEvent: Event): void {
        this._oActiveSearchField = oEvent.getSource() as Control;
        if (!this._oCdsValueHelpHandler) {
            this._oCdsValueHelpHandler = new CdsValueHelpHandler(this.getView()!, (s: string) => this._processValueHelpSelection(s));
        }
        this._oCdsValueHelpHandler.open();
    }

    private _processValueHelpSelection(sSelectedCds: string): void {
        const oActiveField = this._oActiveSearchField as any;
        if (!oActiveField) return;

        if (oActiveField.isA("sap.m.MultiInput")) {
            const oMI = oActiveField as MultiInput;
            if (!oMI.getTokens().some((t: Token) => t.getKey() === sSelectedCds)) {
                oMI.addToken(new Token({ key: sSelectedCds, text: sSelectedCds }));
            }
            oMI.focus();
        } else if (oActiveField.isA("sap.m.Input") || oActiveField.isA("sap.m.ComboBox")) {
            oActiveField.setValue(sSelectedCds);
            (this.byId("btnGenerate") as Button)?.focus();
        }
        this._oActiveSearchField = undefined;
    }

    public onShowInfo(oEvent: Event): void {
        const oIcon = oEvent.getSource() as Icon;
        const sInfoType = oIcon.data("infoType") as string;
        const sTitle = this._getText(`infoTitle${sInfoType}`);
        const sText = this._getText(`infoText${sInfoType}`);

        if (!this._oInfoPopover) {
            this._oInfoPopover = new ResponsivePopover({
                placement: "Right", contentWidth: "300px", showHeader: true,
                content: [ new Text({ text: "{popover>/text}" }).addStyleClass("sapUiSmallMargin") ]
            });
            this.getView()?.addDependent(this._oInfoPopover);
        }

        this._oInfoPopover.setModel(new JSONModel({ text: sText }), "popover");
        this._oInfoPopover.setTitle(sTitle);
        this._oInfoPopover.openBy(oIcon);
    }

    private _getText(sKey: string): string {
        const oBundle = (this.getOwnerComponent()?.getModel("i18n") as any)?.getResourceBundle();
        return oBundle ? oBundle.getText(sKey) || sKey : sKey;
    }
}