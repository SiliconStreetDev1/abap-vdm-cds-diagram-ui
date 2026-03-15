/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Main Controller for VDM Diagram Generator.
 * @version 2.2
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
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
import SegmentedButton from "sap/m/SegmentedButton";
import VBox from "sap/m/VBox";
import ResponsivePopover from "sap/m/ResponsivePopover";
import Text from "sap/m/Text";
import Icon from "sap/ui/core/Icon"; 

import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import Model from "sap/ui/model/Model";

// Dedicated Handlers
import FilterBuilder from "../util/FilterBuilder";
import Renderer from "../util/Renderer";
import ExportHandler from "./ExportHandler";
import VariantHandler from "./VariantHandler";
import CdsValueHelpHandler from "./CdsValueHelpHandler";

// FIX: Extend standard UI5 Controller directly to bypass TS/Babel inheritance bugs
export default class Main extends Controller {

    // Ensure no property is initialized inline (e.g. '= null') to prevent TS constructor generation
    private _oInfoPopover?: ResponsivePopover;
    
    // Delegated Modules
    private _oExportHandler!: ExportHandler;
    private _oVariantHandler!: VariantHandler;
    private _oCdsValueHelpHandler?: CdsValueHelpHandler;
    private _oActiveSearchField?: Control;

    /**
     * @method onInit
     * @description Instantiates handlers and establishes UI/Data bindings.
     * @public
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        // Instantiate Delegates safely here
        this._oExportHandler = new ExportHandler(oView, this.getText.bind(this), this._showError.bind(this));
        this._oVariantHandler = new VariantHandler(oView, this.getText.bind(this));

        // "ui" model handles transient screen state, engine tracking, and format configurations
        this.setModel(new JSONModel({
            showHelp: false,
            activeEngine: "PLANTUML",
            formatPlantUML: { lineStyle: "default", spaced_out: false, staggered: false, modern: true },
            formatGraphviz: { lineStyle: "default", spaced_out: false, modern: true, left_to_right: false, concentrate_edges: false, monochrome: false },
            formatMermaid: { direction: "TB", theme: "default" }
        }), "ui");

        // "diagramData" stores the active OData response for export actions
        this.setModel(new JSONModel({
            payload: "", extension: "", cdsName: "", engine: ""
        }), "diagramData");

        // Configure Input Token Validators
        const fnTokenValidator = (args: { text: string }) => {
            const sCleanText = args.text.trim().toUpperCase();
            if (sCleanText.includes("*") || sCleanText.includes("%")) {
                MessageToast.show(this.getText("msgWildcardWarn"));
                return null; 
            }
            if (!sCleanText) return null;

            const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
            const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();
            if ([...aIncTokens, ...aExcTokens].some(t => t.getKey() === sCleanText)) {
                MessageToast.show(this.getText("msgDuplicateWarn"));
                return null;
            }
            return new Token({ key: sCleanText, text: sCleanText });
        };
        
        (this.byId("inpInclude") as MultiInput).addValidator(fnTokenValidator);
        (this.byId("inpExclude") as MultiInput).addValidator(fnTokenValidator);

        this._oVariantHandler.loadHistoryAndVariants();
    }

    /**
     * @method onGenerate
     * @description Coordinates OData execution by utilizing FilterBuilder.
     * @public
     */
    public onGenerate(): void {
        const sCdsName = (this.byId("cmbCdsName") as ComboBox).getValue().trim().toUpperCase();
        if (!sCdsName) {
            MessageToast.show(this.getText("msgEnterCds"));
            return;
        }

        const sEngine = (this.byId("selEngine") as Select).getSelectedKey();
        
        this._resetCanvasState();
        BusyIndicator.show(0);

        // Delegate UI extraction to FilterBuilder
        const aFilters = FilterBuilder.buildFiltersFromView(this.getView()!, sCdsName, sEngine);
        const oModel = this.getModel() as ODataModel;
        
        if (oModel) {
            const oListBinding = oModel.bindList("/Diagram") as ODataListBinding;
            oListBinding.filter(aFilters);
            
            oListBinding.requestContexts(0, 1)
                .then((aContexts: any[]) => this._handleGenerationSuccess(aContexts, sCdsName, sEngine))
                .catch((oError: any) => {
                    let sErrorMsg = oError.message || "Unknown error";
                    if (oError.error && oError.error.message) {
                        sErrorMsg = oError.error.message;
                    }
                    this._showError(this.getText("msgReqFailed", [sErrorMsg]));
                })
                .finally(() => {
                    BusyIndicator.hide();
                });
        }
    }

    private _handleGenerationSuccess(aContexts: any[], sCdsName: string, sEngine: string): void {
        if (!aContexts || aContexts.length === 0) {
            this._showError(this.getText("msgNoMeta"));
            return;
        }

        const oResult = aContexts[0].getObject();
        const sPayload = oResult.DiagramPayload;

        if (sPayload.startsWith("Error:")) {
            this._showError(sPayload.replace("Error: ", ""));
            return;
        }

        this._oVariantHandler.updateHistory(sCdsName);
        
        // Cache data for ExportHandler
        (this.getModel("diagramData") as JSONModel).setData({
            payload: oResult.DiagramPayload, extension: oResult.FileExtension, cdsName: oResult.CdsName, engine: sEngine
        });

        (this.byId("toolbarActions") as Toolbar).setVisible(true);

        if (sEngine === "D2") {
            (this.byId("btnDownloadImg") as Button).setVisible(false);
            (this.byId("btnDownloadPng") as Button).setVisible(false);
            this._showError(this.getText("msgD2Warning"));
            return;
        }

        const MAX_PAYLOAD_CHARS = 100000; 
        if (sPayload.length > MAX_PAYLOAD_CHARS) {
            (this.byId("btnDownloadImg") as Button).setVisible(false);
            (this.byId("btnDownloadPng") as Button).setVisible(false);
            const iSizeKb = Math.round(sPayload.length / 1024);
            this._showError(`Diagram too large to render (${iSizeKb} KB). Please use "Download Source".`);
            return;
        }

        (this.byId("btnDownloadImg") as Button).setVisible(true);
        (this.byId("btnDownloadPng") as Button).setVisible(true);

        const oHtml = this.byId("htmlRenderer") as HTML;
        oHtml.setVisible(true);

        Renderer.renderDiagram(sEngine, sPayload, oHtml, (sMsg: string) => this._showError(sMsg));
    }

    // ========================================================================
    // DELEGATED EXPORT ACTIONS
    // ========================================================================
    public onDownloadPng(): void   { this._oExportHandler.downloadPng(); }
    public onDownloadImage(): void { this._oExportHandler.downloadSvg(); }
    public onDownloadSource(): void{ this._oExportHandler.downloadSource(); }
    public onCopySyntax(): void    { this._oExportHandler.copySyntax(); }

    // ========================================================================
    // DELEGATED VARIANT ACTIONS
    // ========================================================================
    public onSaveVariant(): void         { this._oVariantHandler.openSaveDialog(); }
    public onDeleteVariant(): void       { this._oVariantHandler.deleteSelected(); }
    public onVariantChange(e: Event): void { this._oVariantHandler.applyVariant(e); }

    // ========================================================================
    // F4 CDS VALUE HELP ACTIONS
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

        if (oActiveField.isA("sap.m.MultiInput")) {
            const oMI = oActiveField as MultiInput;
            if (!oMI.getTokens().some(t => t.getKey() === sSelectedCds)) {
                oMI.addToken(new Token({ key: sSelectedCds, text: sSelectedCds }));
            }
            oMI.focus();
        } else if (oActiveField.isA("sap.m.Input") || oActiveField.isA("sap.m.ComboBox")) {
            oActiveField.setValue(sSelectedCds);
            (this.byId("btnGenerate") as Button)?.focus();
        }

        this._oActiveSearchField = undefined;
    }

    // ========================================================================
    // VIEW STATE TOGGLES
    // ========================================================================
    public onEngineChange(oEvent: Event): void {
        const sEngine = (oEvent.getSource() as Select).getSelectedKey();
        const oUiModel = this.getModel("ui") as JSONModel;
        oUiModel.setProperty("/activeEngine", sEngine);

        // Reset formatting safely
        oUiModel.setProperty("/formatPlantUML", { lineStyle: "default", spaced_out: false, staggered: false, modern: true });
        oUiModel.setProperty("/formatGraphviz", { lineStyle: "default", spaced_out: false, modern: true, left_to_right: false, concentrate_edges: false, monochrome: false });
        oUiModel.setProperty("/formatMermaid", { direction: "TB", theme: "default" });
    }

    public onRelModeChange(oEvent: Event): void {
        const sSelectedMode = (oEvent.getSource() as SegmentedButton).getSelectedKey();
        (this.byId("boxLines") as VBox).setVisible(sSelectedMode === "LINES");
        (this.byId("boxDiscovery") as VBox).setVisible(sSelectedMode !== "LINES");
    }

    public onToggleFullScreen(oEvent: Event): void {
        const oButton = oEvent.getSource() as Button;
        const oLeftPaneLayout = this.byId("leftPaneLayout") as SplitterLayoutData;
        
        if (oButton.getIcon() === "sap-icon://exit-full-screen") {
            oLeftPaneLayout.setSize("400px");
            oButton.setIcon("sap-icon://full-screen");
        } else {
            oLeftPaneLayout.setSize("0px");
            oButton.setIcon("sap-icon://exit-full-screen");
        }
    }

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
    // PRIVATE UTILITIES & HELPERS
    // ========================================================================
    private _resetCanvasState(): void {
        (this.byId("msgEmpty") as IllustratedMessage).setVisible(false);
        (this.byId("msgError") as MessageStrip).setVisible(false);
        (this.byId("htmlRenderer") as HTML).setVisible(false);
        (this.byId("toolbarActions") as Toolbar).setVisible(false);
    }

    private _showError(sMessage: string): void {
        const oMsgStrip = this.byId("msgError") as MessageStrip;
        oMsgStrip.setText(sMessage);
        oMsgStrip.setVisible(true);
        (this.byId("msgEmpty") as IllustratedMessage).setVisible(true);
    }

    /**
     * Convenience method for getting the view model by name.
     */
    public getModel(sName?: string): Model {
        return this.getView()?.getModel(sName) as Model;
    }

    /**
     * Convenience method for setting the view model.
     */
    public setModel(oModel: Model, sName?: string): void {
        this.getView()?.setModel(oModel, sName);
    }

    /**
     * Helper to read strings safely from the i18n file.
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