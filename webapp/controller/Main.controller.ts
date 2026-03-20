/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Main Controller for VDM Diagram Generator.
 * @version 2.2
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 * * DESIGN RATIONALE:
 * This controller serves as the primary orchestrator for the VDM Diagrammer view.
 * Following the Single Responsibility Principle, it delegates heavy lifting (API filtering, 
 * variant persistence, and canvas exporting) to dedicated utility classes.
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
import FilterBuilder from "../helpers/FilterBuilder";
import Renderer from "../renderer/Renderer";
import ExportHandler from "./ExportHandler";
import VariantHandler from "./VariantHandler";
import CdsValueHelpHandler from "./CdsValueHelpHandler";

// FIX: Extend standard UI5 Controller directly to bypass TS/Babel inheritance bugs
export default class Main extends Controller {

    // Ensure no property is initialized inline (e.g. '= null') to prevent TS constructor generation
    /** @type {ResponsivePopover} _oInfoPopover - Cached instance for context help popovers */
    private _oInfoPopover?: ResponsivePopover;
    
    // Delegated Modules
    /** @type {ExportHandler} _oExportHandler - Manages SVG/PNG/File downloads */
    private _oExportHandler!: ExportHandler;
    /** @type {VariantHandler} _oVariantHandler - Manages saving/loading UI configurations */
    private _oVariantHandler!: VariantHandler;
    /** @type {CdsValueHelpHandler} _oCdsValueHelpHandler - Manages the F4 search dialog */
    private _oCdsValueHelpHandler?: CdsValueHelpHandler;
    /** @type {Control} _oActiveSearchField - Tracks which field triggered the F4 dialog for focus management */
    private _oActiveSearchField?: Control;

    /**
     * @method onInit
     * @description Controller lifecycle initialization. Instantiates delegated handlers, 
     * establishes UI models, sets up input validation, and loads user persistence data.
     * @public
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        // Instantiate Delegates safely here, passing context and bound helper methods
        this._oExportHandler = new ExportHandler(oView, this.getText.bind(this), this._showError.bind(this));
        this._oVariantHandler = new VariantHandler(oView, this.getText.bind(this));

        // "ui" model handles transient screen state, engine tracking, and format configurations
        this.setModel(new JSONModel({
            showHelp: false,
            activeEngine: "GRAPHVIZ",
            formatPlantUML: { lineStyle: "default", spaced_out: false, staggered: false, modern: true },
            formatGraphviz: { lineStyle: "default", spaced_out: false, modern: true, left_to_right: false, concentrate_edges: false, monochrome: false },
            formatMermaid: { direction: "TB", theme: "default" }
        }), "ui");

        // "diagramData" stores the active OData response metadata for export actions
        this.setModel(new JSONModel({
            payload: "", extension: "", cdsName: "", engine: ""
        }), "diagramData");

        /**
         * Configure Input Token Validators for Include/Exclude MultiInputs.
         * Enforces strict uppercase, blocks wildcards to protect the ABAP backend, 
         * and prevents duplicate entries across both lists.
         */
        const fnTokenValidator = (args: { text: string }) => {
            const sCleanText = args.text.trim().toUpperCase();
            
            // Validation 1: Block wildcards
            if (sCleanText.includes("*") || sCleanText.includes("%")) {
                MessageToast.show(this.getText("msgWildcardWarn"));
                return null; 
            }
            if (!sCleanText) return null;

            // Validation 2: Block duplicates
            const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
            const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();
            if ([...aIncTokens, ...aExcTokens].some(t => t.getKey() === sCleanText)) {
                MessageToast.show(this.getText("msgDuplicateWarn"));
                return null;
            }
            
            return new Token({ key: sCleanText, text: sCleanText });
        };
        
        // Attach validators to the specific UI controls
        (this.byId("inpInclude") as MultiInput).addValidator(fnTokenValidator);
        (this.byId("inpExclude") as MultiInput).addValidator(fnTokenValidator);

        // Hydrate the screen with previously saved configurations
        this._oVariantHandler.loadHistoryAndVariants();
    }

    /**
     * @method onGenerate
     * @description Primary event handler for diagram creation. Validates mandatory input, 
     * delegates filter construction to the utility class, and executes the OData V4 request.
     * @public
     */
    public onGenerate(): void {
        const sCdsName = (this.byId("cmbCdsName") as ComboBox).getValue().trim().toUpperCase();
        if (!sCdsName) {
            MessageToast.show(this.getText("msgEnterCds"));
            return;
        }

        const sEngine = (this.byId("selEngine") as Select).getSelectedKey();
        
        // Lock UI and reset view state
        this._resetCanvasState();
        BusyIndicator.show(0);

        // Delegate UI extraction to FilterBuilder
        const aFilters = FilterBuilder.buildFiltersFromView(this.getView()!, sCdsName, sEngine);
        const oModel = this.getModel() as ODataModel;
        
        if (oModel) {
            // OData V4 List Binding Workflow: bind to entity, apply constructed filters, fetch 1 context
            const oListBinding = oModel.bindList("/Diagram") as ODataListBinding;
            oListBinding.filter(aFilters);
            
            oListBinding.requestContexts(0, 1)
                .then((aContexts: any[]) => this._handleGenerationSuccess(aContexts, sCdsName, sEngine))
                .catch((oError: any) => {
                    // Extract deep SAP ABAP backend messages if available
                    let sErrorMsg = oError.message || "Unknown error";
                    if (oError.error && oError.error.message) {
                        sErrorMsg = oError.error.message;
                    }
                    this._showError(this.getText("msgReqFailed", [sErrorMsg]));
                })
                .finally(() => {
                    BusyIndicator.hide(); // Ensure UI always unlocks
                });
        }
    }

    /**
     * @method _handleGenerationSuccess
     * @description Processes the successful backend payload. Applies size gatekeeping to 
     * prevent browser rendering crashes for massive diagrams.
     * @param {any[]} aContexts - Array of OData contexts.
     * @param {string} sCdsName - The requested CDS object.
     * @param {string} sEngine - The requested diagram engine.
     * @private
     */
    private _handleGenerationSuccess(aContexts: any[], sCdsName: string, sEngine: string): void {
        if (!aContexts || aContexts.length === 0) {
            this._showError(this.getText("msgNoMeta"));
            return;
        }

        const oResult = aContexts[0].getObject();
        const sPayload = oResult.DiagramPayload;

        // Trap dynamic generation errors returned inside the text payload from ABAP
        if (sPayload.startsWith("Error:")) {
            this._showError(sPayload.replace("Error: ", ""));
            return;
        }

        // Persist successful search to local history
        this._oVariantHandler.updateHistory(sCdsName);
        
        // Cache data for ExportHandler to avoid re-querying the backend during downloads
        (this.getModel("diagramData") as JSONModel).setData({
            payload: oResult.DiagramPayload, extension: oResult.FileExtension, cdsName: oResult.CdsName, engine: sEngine
        });

        (this.byId("toolbarActions") as Toolbar).setVisible(true);

        // Restriction: Current D2 engine implementation does not support live visual rendering
        if (sEngine === "D2") {
            (this.byId("btnDownloadImg") as Button).setVisible(false);
            (this.byId("btnDownloadPng") as Button).setVisible(false);
            this._showError(this.getText("msgD2Warning"));
            return;
        }

        /**
         * ENTERPRISE UX: THE SIZE GATEKEEPER
         * Massive diagrams cause browser rendering threads to hang or crash.
         * If the payload > 100k chars, force the user to view it locally via "Download Source".
         */
        const MAX_PAYLOAD_CHARS = 100000; 
        if (sPayload.length > MAX_PAYLOAD_CHARS) {
            (this.byId("btnDownloadImg") as Button).setVisible(false);
            (this.byId("btnDownloadPng") as Button).setVisible(false);
            const iSizeKb = Math.round(sPayload.length / 1024);
            this._showError(`Diagram too large to render (${iSizeKb} KB). Please use "Download Source".`);
            return;
        }

        // Payload is safe to visualize
        (this.byId("btnDownloadImg") as Button).setVisible(true);
        (this.byId("btnDownloadPng") as Button).setVisible(true);

        const oHtml = this.byId("htmlRenderer") as HTML;
        oHtml.setVisible(true);

        // Hand off the raw DOM injection and library initialization to the Renderer utility
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
    public onSaveVariant(): void           { this._oVariantHandler.openSaveDialog(); }
    public onDeleteVariant(): void         { this._oVariantHandler.deleteSelected(); }
    public onVariantChange(e: Event): void { this._oVariantHandler.applyVariant(e); }

    // ========================================================================
    // F4 CDS VALUE HELP ACTIONS
    // ========================================================================
    
    /**
     * @method onCdsValueHelpRequest
     * @description Tracks the source control and lazy-loads the F4 dialog handler.
     * @param {Event} oEvent - The F4 request event.
     * @public
     */
    public onCdsValueHelpRequest(oEvent: Event): void {
        // Critical: Store the control that triggered F4 so we know where to put the resulting selection
        this._oActiveSearchField = oEvent.getSource() as Control;
        
        if (!this._oCdsValueHelpHandler) {
            this._oCdsValueHelpHandler = new CdsValueHelpHandler(this.getView()!, (s: string) => this._processValueHelpSelection(s));
        }
        this._oCdsValueHelpHandler.open();
    }

    /**
     * @method _processValueHelpSelection
     * @description Routes the F4 selection back to either a MultiInput or standard Input/ComboBox.
     * Implements intelligent focus management to improve user workflow.
     * @param {string} sSelectedCds - Selected item from the dialog.
     * @private
     */
    private _processValueHelpSelection(sSelectedCds: string): void {
        const oActiveField = this._oActiveSearchField as any;
        if (!oActiveField) return;

        // Scenario A: Result goes to a MultiInput list (Include/Exclude)
        if (oActiveField.isA("sap.m.MultiInput")) {
            const oMI = oActiveField as MultiInput;
            if (!oMI.getTokens().some(t => t.getKey() === sSelectedCds)) {
                oMI.addToken(new Token({ key: sSelectedCds, text: sSelectedCds }));
            }
            oMI.focus(); // Keep focus here so the user can continue adding items
            
        // Scenario B: Result goes to a standard Input or ComboBox (Primary Target)
        } else if (oActiveField.isA("sap.m.Input") || oActiveField.isA("sap.m.ComboBox")) {
            oActiveField.setValue(sSelectedCds);
            (this.byId("btnGenerate") as Button)?.focus(); // Move focus to 'Generate' to enable 'Enter' key flow
        }

        // Reset tracking state to satisfy strict typing
        this._oActiveSearchField = undefined;
    }

    // ========================================================================
    // VIEW STATE TOGGLES
    // ========================================================================
    
    /**
     * @method onEngineChange
     * @description Adjusts UI visibility for engine-specific formatting and resets values to safe defaults.
     * @public
     */
    public onEngineChange(oEvent: Event): void {
        const sEngine = (oEvent.getSource() as Select).getSelectedKey();
        const oUiModel = this.getModel("ui") as JSONModel;
        oUiModel.setProperty("/activeEngine", sEngine);

        // Reset formatting safely to avoid cross-engine pollution
        oUiModel.setProperty("/formatPlantUML", { lineStyle: "default", spaced_out: false, staggered: false, modern: true });
        oUiModel.setProperty("/formatGraphviz", { lineStyle: "default", spaced_out: false, modern: true, left_to_right: false, concentrate_edges: false, monochrome: false });
        oUiModel.setProperty("/formatMermaid", { direction: "TB", theme: "default" });
    }

    /**
     * @method onRelModeChange
     * @description Toggles visibility of mutually exclusive line configuration panels.
     * @public
     */
    public onRelModeChange(oEvent: Event): void {
        const sSelectedMode = (oEvent.getSource() as SegmentedButton).getSelectedKey();
        (this.byId("boxLines") as VBox).setVisible(sSelectedMode === "LINES");
        (this.byId("boxDiscovery") as VBox).setVisible(sSelectedMode !== "LINES");
    }

    /**
     * @method onToggleFullScreen
     * @description Collapses the left configuration pane to maximize the diagram canvas.
     * @public
     */
    public onToggleFullScreen(oEvent: Event): void {
        const oButton = oEvent.getSource() as Button;
        const oLeftPaneLayout = this.byId("leftPaneLayout") as SplitterLayoutData;
        
        if (oButton.getIcon() === "sap-icon://exit-full-screen") {
            oLeftPaneLayout.setSize("400px"); // Restore configuration pane
            oButton.setIcon("sap-icon://full-screen");
        } else {
            oLeftPaneLayout.setSize("0px"); // Hide configuration pane
            oButton.setIcon("sap-icon://exit-full-screen");
        }
    }

    /**
     * @method onShowInfo
     * @description Displays context-sensitive help popovers for specific fields.
     * @public
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
    // PRIVATE UTILITIES & HELPERS
    // ========================================================================
    
    /**
     * @method _resetCanvasState
     * @description Wipes renderer container and resets messaging visibility.
     * @private
     */
    private _resetCanvasState(): void {
        (this.byId("msgEmpty") as IllustratedMessage).setVisible(false);
        (this.byId("msgError") as MessageStrip).setVisible(false);
        (this.byId("htmlRenderer") as HTML).setVisible(false);
        (this.byId("toolbarActions") as Toolbar).setVisible(false);
    }

    /**
     * @method _showError
     * @description Centralized error feedback mechanism.
     * @private
     */
    private _showError(sMessage: string): void {
        const oMsgStrip = this.byId("msgError") as MessageStrip;
        oMsgStrip.setText(sMessage);
        oMsgStrip.setVisible(true);
        (this.byId("msgEmpty") as IllustratedMessage).setVisible(true);
    }

    /**
     * Convenience method for getting the view model by name.
     * @public
     */
    public getModel(sName?: string): Model {
        return this.getView()?.getModel(sName) as Model;
    }

    /**
     * Convenience method for setting the view model.
     * @public
     */
    public setModel(oModel: Model, sName?: string): void {
        this.getView()?.setModel(oModel, sName);
    }

    /**
     * Helper to read strings safely from the i18n file, ensuring UI robustness 
     * even if models aren't fully hydrated yet.
     * @public
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