/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Selection Controller for capturing user input.
 * @version 2.1
 * @description Manages configuration state, triggers the OData backend service, 
 * and broadcasts the resulting payload via the EventBus. 
 * * ARCHITECTURE NOTE: This controller implements the "Command Center" pattern. 
 * It has zero knowledge of the DOM canvas, Cytoscape, Mermaid, or PlantUML. 
 * It simply gathers the UI parameters, asks the ABAP backend for a string/JSON, 
 * and tosses that payload over the wall (EventBus) for the Renderer to catch.
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
import VariantHandler from "../handlers/VariantHandler";
import CdsValueHelpHandler from "../handlers/CdsValueHelpHandler";
import DiagramService from "../services/DiagramService";
import InputValidationService from "../services/InputValidationService";

export default class Selection extends Controller {

    /** @private {VariantHandler} Manages saving/loading of user configurations */
    private _oVariantHandler!: VariantHandler;
    
    /** @private {CdsValueHelpHandler | undefined} Dialog manager for F4 search */
    private _oCdsValueHelpHandler?: CdsValueHelpHandler;
    
    /** @private {Control | undefined} Tracks the field triggering F4 to route selection back */
    private _oActiveSearchField?: Control;
    
    /** @private {ResponsivePopover | undefined} Popover instance for inline contextual help */
    private _oInfoPopover?: ResponsivePopover;

    /**
     * @public
     * @description Lifecycle hook. Bootstraps local handlers, validators, and default UI state.
     * @returns {void}
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        this._oVariantHandler = new VariantHandler(oView, this._getText.bind(this));

        // Attach Token Validators to prevent users from adding empty/invalid filters
        const oIncInput = this.byId("inpInclude") as MultiInput;
        const oExcInput = this.byId("inpExclude") as MultiInput;
        const fnWarn = (sKey: string) => MessageToast.show(this._getText(sKey));
        
        const fnTokenValidator = InputValidationService.buildTokenValidator(oIncInput, oExcInput, fnWarn);
        oIncInput.addValidator(fnTokenValidator);
        oExcInput.addValidator(fnTokenValidator);

        // Pre-load previous user sessions (Local Storage or LREP)
        this._oVariantHandler.loadHistoryAndVariants();
        
        // Ensure formatting models exist so FilterBuilder doesn't crash on empty lookups
        // This maps exactly to the camelCase JSON needed by the ABAP XCO Framework
        const oUiModel = oView.getModel("ui") as JSONModel;
        if (oUiModel && !oUiModel.getProperty("/formatCytoscape")) {
            oUiModel.setProperty("/formatCytoscape", {
                layoutAlgorithm: "cose",
                theme: "fiori_light",
                animate: true,
                nodeSpacing: 100
            });
        }
    }

    /**
     * @public
     * @description Core execution routine. Gathers all UI inputs, calls the ABAP RAP 
     * Provider, and publishes the payload via EventBus for the rendering engine.
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
            // FilterBuilder scrapes the UI Model (including the new /formatCytoscape)
            // and packages it into RAP-compliant filter ranges.
            const aFilters = FilterBuilder.buildFiltersFromView(this.getView()!, sCdsName, sEngine);
            
            // Execute the backend call (Hits zcl_vdm_diagram_query)
            const oResult = await DiagramService.fetchDiagram(oModel, aFilters);
            
            // Log successful search for the dropdown history
            this._oVariantHandler.updateHistory(oResult.CdsName);
            DiagramService.validatePayloadSize(oResult.DiagramPayload);

            // PUBLISH TO EVENTBUS
            // We do not care how it is drawn. The Diagram.controller.ts is listening 
            // for this exact signature and will route it to the correct JS library.
            const oEventBus = this.getOwnerComponent()?.getEventBus();
            if (oEventBus) {
                oEventBus.publish("DiagramEngine", "RenderRequest", {
                    payload: oResult.DiagramPayload, // PlantUML String OR Cytoscape JSON
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

    // ========================================================================
    // UI EVENT DELEGATIONS (Managed by Helpers to keep Controller thin)
    // ========================================================================

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

    // ========================================================================
    // VALUE HELP (F4 SEARCH) LOGIC
    // ========================================================================

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

        // If the F4 was triggered from an Include/Exclude box, add it as a Token
        if (oActiveField.isA("sap.m.MultiInput")) {
            const oMI = oActiveField as MultiInput;
            if (!oMI.getTokens().some((t: Token) => t.getKey() === sSelectedCds)) {
                oMI.addToken(new Token({ key: sSelectedCds, text: sSelectedCds }));
            }
            oMI.focus();
        } 
        // If triggered from the main View Name box, overwrite value and focus Generate button
        else if (oActiveField.isA("sap.m.Input") || oActiveField.isA("sap.m.ComboBox")) {
            oActiveField.setValue(sSelectedCds);
            (this.byId("btnGenerate") as Button)?.focus();
        }
        this._oActiveSearchField = undefined;
    }

    // ========================================================================
    // CONTEXTUAL HELP (POPOVER)
    // ========================================================================

    public onShowInfo(oEvent: Event): void {
        const oIcon = oEvent.getSource() as Icon;
        const sInfoType = oIcon.data("infoType") as string;
        
        // Dynamically fetch translations based on the CustomData attribute attached to the Icon
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

    /**
     * @private
     * @description Safe utility to retrieve translation strings. Fallback to key if missing.
     * @param {string} sKey - i18n key.
     * @returns {string} Translated text.
     */
    private _getText(sKey: string): string {
        const oBundle = (this.getOwnerComponent()?.getModel("i18n") as any)?.getResourceBundle();
        return oBundle ? oBundle.getText(sKey) || sKey : sKey;
    }
}