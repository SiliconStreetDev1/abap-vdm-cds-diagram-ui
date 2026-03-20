/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Main Controller for VDM Diagram Generator.
 * @version 3.0
 * @description Operates as a pure orchestrator 
 * All API interactions, input validations, and UI state mutations are delegated to 
 * dedicated service and helper classes.
 */

import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";

import ComboBox from "sap/m/ComboBox";
import Select from "sap/m/Select";
import Button from "sap/m/Button";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import HTML from "sap/ui/core/HTML";
import MessageStrip from "sap/m/MessageStrip";
import IllustratedMessage from "sap/m/IllustratedMessage";
import Toolbar from "sap/m/Toolbar";
import SplitterLayoutData from "sap/ui/layout/SplitterLayoutData";
import VBox from "sap/m/VBox";
import ResponsivePopover from "sap/m/ResponsivePopover";
import Text from "sap/m/Text";
import Icon from "sap/ui/core/Icon"; 
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import Model from "sap/ui/model/Model";

import FilterBuilder from "../helpers/FilterBuilder";
import ViewStateHelper from "../helpers/ViewStateHelper";
import Renderer from "../renderer/Renderer";
import ExportHandler from "./ExportHandler";
import VariantHandler from "./VariantHandler";
import CdsValueHelpHandler from "./CdsValueHelpHandler";
import DiagramService from "../services/DiagramService";
import InputValidationService from "../services/InputValidationService";

export default class Main extends Controller {

    /** @private {ResponsivePopover | undefined} Cached instance for context help popovers */
    private _oInfoPopover?: ResponsivePopover;
    
    /** @private {ExportHandler} Manages SVG/PNG/File downloads */
    private _oExportHandler!: ExportHandler;
    
    /** @private {VariantHandler} Manages saving/loading UI configurations */
    private _oVariantHandler!: VariantHandler;
    
    /** @private {CdsValueHelpHandler | undefined} Manages the F4 search dialog */
    private _oCdsValueHelpHandler?: CdsValueHelpHandler;
    
    /** @private {Control | undefined} Tracks which field triggered the F4 dialog for focus management */
    private _oActiveSearchField?: Control;

    /**
     * @public
     * @description Initializes dependencies, delegates validation rules, and hydrates UI models.
     * @returns {void}
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        this._oExportHandler = new ExportHandler(oView, this.getText.bind(this), this._showError.bind(this));
        this._oVariantHandler = new VariantHandler(oView, this.getText.bind(this));

        this.setModel(ViewStateHelper.initializeUiModel(), "ui");
        this.setModel(new JSONModel({ payload: "", extension: "", cdsName: "", engine: "" }), "diagramData");

        const oIncInput = this.byId("inpInclude") as MultiInput;
        const oExcInput = this.byId("inpExclude") as MultiInput;
        const fnWarn = (sKey: string) => MessageToast.show(this.getText(sKey));
        
        const fnTokenValidator = InputValidationService.buildTokenValidator(oIncInput, oExcInput, fnWarn);
        oIncInput.addValidator(fnTokenValidator);
        oExcInput.addValidator(fnTokenValidator);

        this._oVariantHandler.loadHistoryAndVariants();
    }

    /**
     * @public
     * @description Orchestrates the payload request via DiagramService and routes the result to the Renderer.
     * @returns {Promise<void>}
     */
    public async onGenerate(): Promise<void> {
        const sCdsName = (this.byId("cmbCdsName") as ComboBox).getValue().trim().toUpperCase();
        if (!sCdsName) {
            MessageToast.show(this.getText("msgEnterCds"));
            return;
        }

        const sEngine = (this.byId("selEngine") as Select).getSelectedKey();
        const oModel = this.getModel() as ODataModel;
        
        this._resetCanvasState();
        BusyIndicator.show(0);

        try {
            const aFilters = FilterBuilder.buildFiltersFromView(this.getView()!, sCdsName, sEngine);
            const oResult = await DiagramService.fetchDiagram(oModel, aFilters);
            
            this._oVariantHandler.updateHistory(oResult.CdsName);
            (this.getModel("diagramData") as JSONModel).setData({
                payload: oResult.DiagramPayload, extension: oResult.FileExtension, cdsName: oResult.CdsName, engine: sEngine
            });

            (this.byId("toolbarActions") as Toolbar).setVisible(true);

            if (sEngine === "D2") {
                (this.byId("btnDownloadImg") as Button).setVisible(false);
                (this.byId("btnDownloadPng") as Button).setVisible(false);
                throw new Error("msgD2Warning");
            }

            DiagramService.validatePayloadSize(oResult.DiagramPayload);

            (this.byId("btnDownloadImg") as Button).setVisible(true);
            (this.byId("btnDownloadPng") as Button).setVisible(true);

            const oHtml = this.byId("htmlRenderer") as HTML;
            oHtml.setVisible(true);

            Renderer.renderDiagram(sEngine, oResult.DiagramPayload, oHtml, (sMsg: string) => this._showError(sMsg));

        } catch (oError: any) {
            this._showError(this.getText(oError.message) || oError.message);
        } finally {
            BusyIndicator.hide();
        }
    }

    // ========================================================================
    // DELEGATED EXPORT ACTIONS
    // ========================================================================
    
    /**
     * @public
     * @description Triggers the PNG export workflow via the ExportHandler.
     * @returns {void}
     */
    public onDownloadPng(): void   { this._oExportHandler.downloadPng(); }
    
    /**
     * @public
     * @description Triggers the SVG vector export workflow via the ExportHandler.
     * @returns {void}
     */
    public onDownloadImage(): void { this._oExportHandler.downloadSvg(); }
    
    /**
     * @public
     * @description Triggers the raw source code download workflow via the ExportHandler.
     * @returns {void}
     */
    public onDownloadSource(): void{ this._oExportHandler.downloadSource(); }
    
    /**
     * @public
     * @description Copies the raw syntax to the user's clipboard via the ExportHandler.
     * @returns {void}
     */
    public onCopySyntax(): void    { this._oExportHandler.copySyntax(); }

    // ========================================================================
    // DELEGATED VARIANT ACTIONS
    // ========================================================================
    
    /**
     * @public
     * @description Opens the dialog to save the current UI state as a variant.
     * @returns {void}
     */
    public onSaveVariant(): void         { this._oVariantHandler.openSaveDialog(); }
    
    /**
     * @public
     * @description Deletes the currently selected variant from persistence.
     * @returns {void}
     */
    public onDeleteVariant(): void       { this._oVariantHandler.deleteSelected(); }
    
    /**
     * @public
     * @description Applies a saved variant's configuration to the UI.
     * @param {Event} e - The variant selection event.
     * @returns {void}
     */
    public onVariantChange(e: Event): void { this._oVariantHandler.applyVariant(e); }

    // ========================================================================
    // VIEW STATE DELEGATION
    // ========================================================================
    
    /**
     * @public
     * @description Delegates engine selection changes to the ViewStateHelper.
     * @param {Event} oEvent - The Select change event.
     * @returns {void}
     */
    public onEngineChange(oEvent: Event): void {
        ViewStateHelper.handleEngineChange(oEvent, this.getModel("ui") as JSONModel);
    }

    /**
     * @public
     * @description Delegates relationship mode toggles to the ViewStateHelper.
     * @param {Event} oEvent - The SegmentedButton press event.
     * @returns {void}
     */
    public onRelModeChange(oEvent: Event): void {
        ViewStateHelper.toggleRelMode(oEvent, this.byId("boxLines") as VBox, this.byId("boxDiscovery") as VBox);
    }

    /**
     * @public
     * @description Delegates layout adjustments for full-screen toggling to the ViewStateHelper.
     * @param {Event} oEvent - The Button press event.
     * @returns {void}
     */
    public onToggleFullScreen(oEvent: Event): void {
        ViewStateHelper.toggleFullScreen(oEvent, this.byId("leftPaneLayout") as SplitterLayoutData);
    }

    // ========================================================================
    // F4 CDS VALUE HELP ACTIONS
    // ========================================================================
    
    /**
     * @public
     * @description Tracks the source control and opens the F4 dialog via CdsValueHelpHandler.
     * @param {Event} oEvent - The F4 request event.
     * @returns {void}
     */
    public onCdsValueHelpRequest(oEvent: Event): void {
        this._oActiveSearchField = oEvent.getSource() as Control;
        
        if (!this._oCdsValueHelpHandler) {
            this._oCdsValueHelpHandler = new CdsValueHelpHandler(this.getView()!, (s: string) => this._processValueHelpSelection(s));
        }
        this._oCdsValueHelpHandler.open();
    }

    /**
     * @private
     * @description Routes the F4 selection back to the initiating control with focus management.
     * @param {string} sSelectedCds - Selected item from the dialog.
     * @returns {void}
     */
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

    /**
     * @public
     * @description Displays context-sensitive help popovers for specific UI fields.
     * @param {Event} oEvent - The icon press event.
     * @returns {void}
     */
    public onShowInfo(oEvent: Event): void {
        const oIcon = oEvent.getSource() as Icon;
        const sInfoType = oIcon.data("infoType") as string;
        
        const sTitle = this.getText(`infoTitle${sInfoType}`);
        const sText = this.getText(`infoText${sInfoType}`);

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

    // ========================================================================
    // PRIVATE UTILITIES
    // ========================================================================
    
    /**
     * @private
     * @description Wipes renderer container and resets messaging visibility.
     * @returns {void}
     */
    private _resetCanvasState(): void {
        (this.byId("msgEmpty") as IllustratedMessage).setVisible(false);
        (this.byId("msgError") as MessageStrip).setVisible(false);
        (this.byId("htmlRenderer") as HTML).setVisible(false);
        (this.byId("toolbarActions") as Toolbar).setVisible(false);
    }

    /**
     * @private
     * @description Centralized error feedback mechanism for the main view.
     * @param {string} sMessage - The error string to display.
     * @returns {void}
     */
    private _showError(sMessage: string): void {
        const oMsgStrip = this.byId("msgError") as MessageStrip;
        oMsgStrip.setText(sMessage);
        oMsgStrip.setVisible(true);
        (this.byId("msgEmpty") as IllustratedMessage).setVisible(true);
    }

    /**
     * @public
     * @description Convenience method for retrieving view models.
     * @param {string} [sName] - Optional model name.
     * @returns {Model} The requested UI5 model.
     */
    public getModel(sName?: string): Model {
        return this.getView()?.getModel(sName) as Model;
    }

    /**
     * @public
     * @description Convenience method for assigning view models.
     * @param {Model} oModel - The UI5 model instance.
     * @param {string} [sName] - Optional model name.
     * @returns {void}
     */
    public setModel(oModel: Model, sName?: string): void {
        this.getView()?.setModel(oModel, sName);
    }

    /**
     * @public
     * @description Helper to safely read i18n strings, utilizing fallbacks if models aren't fully hydrated.
     * @param {string} sKey - The i18n translation key.
     * @param {any[]} [aArgs] - Optional parameters to pass to the translation string.
     * @returns {string} The translated text, or the key itself as a fallback.
     */
    public getText(sKey: string, aArgs?: any[]): string {
        const oView = this.getView();
        let oResourceBundle = (oView?.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle;
        
        if (!oResourceBundle) {
            oResourceBundle = (this.getOwnerComponent()?.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle;
        }

        return oResourceBundle ? oResourceBundle.getText(sKey, aArgs) || sKey : sKey;
    }
}