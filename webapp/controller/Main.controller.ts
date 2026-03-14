/**
 * @fileoverview Main Controller for VDM Diagram Generator.
 * @version 1.4
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 * * DESIGN RATIONALE:
 * This controller acts as the central orchestrator for the VDM Diagrammer. 
 * It manages the complex interplay between UI state, OData V4 communication, 
 * local storage persistence (Variants), and high-resolution rendering hand-offs.
 * * CORE FUNCTIONALITIES:
 * 1. OData V4 Request Management with mutual exclusivity filtering logic.
 * 2. High-precision SVG/PNG export orchestration.
 * 3. Local Persistence for User Search History and UI Variants.
 * 4. Modular F4 Value Help integration with smart focus management.
 */
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import File from "sap/ui/core/util/File";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";

import ComboBox from "sap/m/ComboBox";
import Select from "sap/m/Select";
import Button from "sap/m/Button";
import Switch from "sap/m/Switch";
import StepInput from "sap/m/StepInput";
import Input from "sap/m/Input";
import HTML from "sap/ui/core/HTML";
import MessageStrip from "sap/m/MessageStrip";
import IllustratedMessage from "sap/m/IllustratedMessage";
import Toolbar from "sap/m/Toolbar";
import SplitterLayoutData from "sap/ui/layout/SplitterLayoutData";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import SegmentedButton from "sap/m/SegmentedButton";
import VBox from "sap/m/VBox";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResponsivePopover from "sap/m/ResponsivePopover";
import Text from "sap/m/Text";
import Icon from "sap/ui/core/Icon"; 

import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

// Custom Utility Classes
import VariantManager from "../util/VariantManager";
import Renderer from "../util/Renderer";
import CdsValueHelpHandler from "./CdsValueHelpHandler";

export default class Main extends Controller {

    // -------------------------------------------------------------------------
    // 0. MEMBER VARIABLES & CACHES
    // -------------------------------------------------------------------------
    
    /** @type {ResponsivePopover} _oInfoPopover - Cached instance for context help popovers */
    private _oInfoPopover: ResponsivePopover | null = null;
    
    /** @type {CdsValueHelpHandler} _oCdsValueHelpHandler - Handler for F4 search logic */
    private _oCdsValueHelpHandler: CdsValueHelpHandler | null = null;
    
    /** @type {Control} _oActiveSearchField - Tracks which field triggered the F4 dialog */
    private _oActiveSearchField: Control | null = null;

    /**
     * @method onInit
     * @description Controller lifecycle initialization. Sets up base models, 
     * registers MultiInput validators, and loads user persistence data.
     * @public
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        // "ui" model handles transient screen state (like help visibility)
        oView.setModel(new JSONModel({
            showHelp: false
        }), "ui");

        // "diagramData" stores the active OData response for export actions
        oView.setModel(new JSONModel({
            payload: "", extension: "", cdsName: "", engine: ""
        }), "diagramData");

        /**
         * @function fnTokenValidator
         * @description Intercepts text entry in MultiInputs to create upper-case Tokens.
         * Enforces strict validation rules: No wildcards and No duplicates.
         * @param {object} args - Validation arguments containing text.
         */
        const fnTokenValidator = (args: { text: string }) => {
            const sCleanText = args.text.trim().toUpperCase();
            
            // Validation 1: Block Wildcards (Prevents backend ambiguity)
            if (sCleanText.includes("*") || sCleanText.includes("%")) {
                MessageToast.show(this._getText("msgWildcardWarn"));
                return null; 
            }
            if (!sCleanText) return null;

            // Validation 2: Block Duplicate Tokens across Include and Exclude lists
            const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
            const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();
            const bIsDuplicate = [...aIncTokens, ...aExcTokens].some(t => t.getKey() === sCleanText);
            
            if (bIsDuplicate) {
                MessageToast.show(this._getText("msgDuplicateWarn"));
                return null;
            }
            
            return new Token({ key: sCleanText, text: sCleanText });
        };
        
        // Register the validators to the controls
        (this.byId("inpInclude") as MultiInput).addValidator(fnTokenValidator);
        (this.byId("inpExclude") as MultiInput).addValidator(fnTokenValidator);

        // Load persisted search history and variants from LocalStorage
        this._loadHistoryAndVariants();
    }

    /* =========================================================== */
    /* 1. ODATA V4 GENERATION LOGIC                                */
    /* =========================================================== */

    /**
     * @method onGenerate
     * @description Primary event handler for the "Generate Diagram" button.
     * Validates input, builds the OData V4 request, and handles the async lifecycle.
     * @public
     */
    public onGenerate(): void {
        const sCdsName = (this.byId("cmbCdsName") as ComboBox).getValue().trim().toUpperCase();
        
        // Validation: Abort if target CDS name is missing
        if (!sCdsName) {
            MessageToast.show(this._getText("msgEnterCds"));
            return;
        }

        const sEngine = (this.byId("selEngine") as Select).getSelectedKey();
        
        // Reset the UI state before starting a new request
        this._resetCanvasState();
        BusyIndicator.show(0);

        // Construct the filter array based on UI switches and multi-inputs
        const aFilters = this._buildODataFilters(sCdsName, sEngine);
        const oModel = this.getView()?.getModel() as ODataModel;
        
        if (oModel) {
            /** * OData V4 List Binding Workflow:
             * We bind to the /Diagram entity set, apply filters, and request 1 context.
             */
            const oListBinding = oModel.bindList("/Diagram") as ODataListBinding;
            oListBinding.filter(aFilters);
            
            // Execute the request via context fetch
            oListBinding.requestContexts(0, 1)
                .then((aContexts: any[]) => this._handleGenerationSuccess(aContexts, sCdsName, sEngine))
                .catch((oError: any) => {
                    // UX Improvement: Extract deep SAP ABAP backend messages if available
                    let sErrorMsg = oError.message || "Unknown error";
                    if (oError.error && oError.error.message) {
                        sErrorMsg = oError.error.message;
                    }
                    this._showError(this._getText("msgReqFailed", [sErrorMsg]));
                })
                .finally(() => {
                    // Guarantee UI unlock
                    BusyIndicator.hide();
                });
        }
    }

    /**
     * @method _handleGenerationSuccess
     * @description Processes the successful backend payload.
     * Implements size gatekeeping to prevent browser pixel/memory crashes.
     * @param {any[]} aContexts - The contexts returned from the OData service.
     * @param {string} sCdsName - The name used in the search.
     * @param {string} sEngine - The rendering engine used.
     * @private
     */
    private _handleGenerationSuccess(aContexts: any[], sCdsName: string, sEngine: string): void {
        if (!aContexts || aContexts.length === 0) {
            this._showError(this._getText("msgNoMeta"));
            return;
        }

        const oResult = aContexts[0].getObject();
        const sPayload = oResult.DiagramPayload;

        // Trap dynamic errors returned inside the text payload from ABAP
        if (sPayload.startsWith("Error:")) {
            this._showError(sPayload.replace("Error: ", ""));
            return;
        }

        // Persist the search to history and bind data for potential download
        this._updateHistory(sCdsName);
        this._bindDownloadData(oResult, sEngine);

        // UI Prep: Reveal the action toolbar
        (this.byId("toolbarActions") as Toolbar).setVisible(true);

        // Restriction: D2 engine does not support physical image extraction in current version
        if (sEngine === "D2") {
            (this.byId("btnDownloadImg") as Button).setVisible(false);
            (this.byId("btnDownloadPng") as Button).setVisible(false);
            this._showError(this._getText("msgD2Warning"));
            return;
        }

        /**
         * ENTERPRISE UX: THE SIZE GATEKEEPER
         * Massive diagrams cause browser rendering threads to hang.
         * If the payload > 100k chars, we force the user to view it locally via "Download Source".
         */
        const MAX_PAYLOAD_CHARS = 100000; 
        if (sPayload.length > MAX_PAYLOAD_CHARS) {
            (this.byId("btnDownloadImg") as Button).setVisible(false);
            (this.byId("btnDownloadPng") as Button).setVisible(false);
            const iSizeKb = Math.round(sPayload.length / 1024);
            
            this._showError(`Diagram too large to render (${iSizeKb} KB). Please use "Download Source" to view locally.`);
            return;
        }

        // Visualizer is safe to run; display the renderer control
        (this.byId("btnDownloadImg") as Button).setVisible(true);
        (this.byId("btnDownloadPng") as Button).setVisible(true);

        const oHtml = this.byId("htmlRenderer") as HTML;
        oHtml.setVisible(true);

        // Delegate raw DOM manipulation and library logic to the Renderer utility
        Renderer.renderDiagram(sEngine, sPayload, oHtml, (sMsg: string) => this._showError(sMsg));
    }

    /**
     * @method _buildODataFilters
     * @description Maps all UI inputs into OData Filter objects.
     * Implements mutual exclusivity logic between "Lines" and "Discovery" modes.
     * @param {string} sCdsName - Targeted CDS view.
     * @param {string} sEngine - Selected renderer engine.
     * @returns {Filter[]} Array of filters for the bindList call.
     * @private
     */
    private _buildODataFilters(sCdsName: string, sEngine: string): Filter[] {
        const sRelMode = (this.byId("segRelMode") as SegmentedButton).getSelectedKey();
        const bIsLinesMode = (sRelMode === "LINES");

        const aFilters = [
            new Filter("CdsName", FilterOperator.EQ, sCdsName),
            new Filter("RendererEngine", FilterOperator.EQ, sEngine),
            new Filter("MaxLevel", FilterOperator.EQ, (this.byId("stepMaxLevel") as StepInput).getValue()),
            new Filter("ShowKeys", FilterOperator.EQ, (this.byId("swKeys") as Switch).getState()),
            new Filter("ShowFields", FilterOperator.EQ, (this.byId("swFields") as Switch).getState()),
            new Filter("ShowAssocFields", FilterOperator.EQ, (this.byId("swAssocFields") as Switch).getState()),
            new Filter("ShowBase", FilterOperator.EQ, (this.byId("swBase") as Switch).getState()),
            new Filter("CustomDevOnly", FilterOperator.EQ, (this.byId("swCustomOnly") as Switch).getState()),
            
            // LOGIC: Mutually exclusive parameters based on Relationship Mode
            new Filter("LineAssoc", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineAssoc") as Switch).getState() : false),
            new Filter("LineComp", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineComp") as Switch).getState() : false),
            new Filter("LineInherit", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineInherit") as Switch).getState() : false),

            new Filter("DiscAssoc", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscAssoc") as Switch).getState() : false),
            new Filter("DiscComp", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscComp") as Switch).getState() : false),
            new Filter("DiscInherit", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscInherit") as Switch).getState() : false)
        ];

        // Process Tokens from MultiInputs into comma-separated strings for ABAP parsing
        const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();
        const sInclude = aIncTokens.map(t => t.getText()).join(",");
        const sExclude = aExcTokens.map(t => t.getText()).join(",");

        if (sInclude) aFilters.push(new Filter("IncludeCds", FilterOperator.EQ, sInclude));
        if (sExclude) aFilters.push(new Filter("ExcludeCds", FilterOperator.EQ, sExclude));

        return aFilters;
    }

    /**
     * @method _bindDownloadData
     * @description Persists metadata in a JSON model to avoid OData re-trips during file saves.
     * @private
     */
    private _bindDownloadData(oResult: any, sEngine: string): void {
        (this.getView()?.getModel("diagramData") as JSONModel).setData({
            payload: oResult.DiagramPayload,
            extension: oResult.FileExtension,
            cdsName: oResult.CdsName,
            engine: sEngine
        });
    }

    /* =========================================================== */
    /* 2. F4 VALUE HELP (CDS SEARCH) INTEGRATION                   */
    /* =========================================================== */

    /**
     * @method onCdsValueHelpRequest
     * @description Universal handler for CDS search requests.
     * Tracks the source control and lazy-loads the dialog handler.
     * @param {Event} oEvent - The F4 request event.
     * @public
     */
    public onCdsValueHelpRequest(oEvent: Event): void {
        const oView = this.getView();
        if (!oView) return;

        // Critical: Store the control that triggered F4 so we know where to put the result
        this._oActiveSearchField = oEvent.getSource() as Control;

        if (!this._oCdsValueHelpHandler) {
            this._oCdsValueHelpHandler = new CdsValueHelpHandler(oView, (sSelectedCds: string) => {
                this._processValueHelpSelection(sSelectedCds);
            });
        }

        this._oCdsValueHelpHandler.open();
    }

    /**
     * @method _processValueHelpSelection
     * @description Routes selection back to either MultiInput or standard Input/ComboBox.
     * Implements intelligent focus management to improve user flow.
     * @param {string} sSelectedCds - Selected item from the dialog.
     * @private
     */
    private _processValueHelpSelection(sSelectedCds: string): void {
        // Use local variable with 'any' cast to avoid TypeScript 'never' analysis errors
        const oActiveField = this._oActiveSearchField as any;
        if (!oActiveField) return;

        // Scenario A: Result goes to a MultiInput (Include/Exclude lists)
        if (oActiveField.isA("sap.m.MultiInput")) {
            const oMultiInput = oActiveField as MultiInput;
            const aExistingTokens = oMultiInput.getTokens();
            
            // Prevent duplicate tokens within the same control
            if (!aExistingTokens.some(t => t.getKey() === sSelectedCds)) {
                oMultiInput.addToken(new Token({ key: sSelectedCds, text: sSelectedCds }));
            }
            // Keep focus here so the user can continue adding CDS views
            oMultiInput.focus();
            
        // Scenario B: Result goes to a standard Input or ComboBox
        } else if (oActiveField.isA("sap.m.Input") || oActiveField.isA("sap.m.ComboBox")) {
            oActiveField.setValue(sSelectedCds);
            
            // UX optimization: Move focus to the Generate button to enable 'Enter' key workflow
            (this.byId("btnGenerate") as Button)?.focus();
        }

        // Reset state
        this._oActiveSearchField = null;
    }

    /* =========================================================== */
    /* 3. UI EVENTS & WORKFLOW ACTIONS                             */
    /* =========================================================== */

    /**
     * @method onShowInfo
     * @description Displays context-sensitive help popovers.
     * @param {Event} oEvent - Triggering icon event.
     * @public
     */
    public onShowInfo(oEvent: Event): void {
        const oIcon = oEvent.getSource() as Icon;
        const sInfoType = oIcon.data("infoType") as string;
        
        const sTitle = this._getText(`infoTitle${sInfoType}`);
        const sText = this._getText(`infoText${sInfoType}`);

        if (!this._oInfoPopover) {
            this._oInfoPopover = new ResponsivePopover({
                placement: "Right",
                contentWidth: "300px",
                showHeader: true,
                content: [
                    new Text({ text: "{popover>/text}" }).addStyleClass("sapUiSmallMargin")
                ]
            });
            this.getView()?.addDependent(this._oInfoPopover);
        }

        this._oInfoPopover.setModel(new JSONModel({ text: sText }), "popover");
        this._oInfoPopover.setTitle(sTitle);
        this._oInfoPopover.openBy(oIcon);
    }

    /**
     * @method onDownloadPng
     * @description Orchestrates the PNG export workflow.
     * Clones the SVG, hardens it for standalone viewing, and converts to 2.0x scale PNG.
     * @public
     */
    public async onDownloadPng(): Promise<void> {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg") as SVGSVGElement;

        if (!oSvg) {
            MessageToast.show(this._getText("msgEmptyTitle"));
            return;
        }

        BusyIndicator.show(0);
        try {
            // Clone the node so hardening doesn't affect the live screen
            const oClone = oSvg.cloneNode(true) as SVGSVGElement;
            
            // Coordinate fix included in harden call (measures live SVG group)
            Renderer.hardenSvgForDownload(oClone, oSvg);
            
            // Convert to high-res PNG Blob
            const oPngBlob = await Renderer.convertSvgToPng(oClone);

            // Trigger browser download via object URL
            const url = URL.createObjectURL(oPngBlob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${oData.cdsName}_${oData.engine}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (oError) {
            this._showError("PNG Export Failed: " + oError);
        } finally {
            BusyIndicator.hide();
        }
    }

    /**
     * @method onRelModeChange
     * @description Toggles visibility of mode-specific switches.
     * @public
     */
    public onRelModeChange(oEvent: Event): void {
        const sSelectedMode = (oEvent.getSource() as SegmentedButton).getSelectedKey();
        (this.byId("boxLines") as VBox).setVisible(sSelectedMode === "LINES");
        (this.byId("boxDiscovery") as VBox).setVisible(sSelectedMode !== "LINES");
    }

    /**
     * @method onDownloadImage
     * @description Exports the hardened SVG file for vector viewing.
     * @public
     */
    public onDownloadImage(): void {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg") as SVGSVGElement;

        if (!oSvg) {
            MessageToast.show(this._getText("msgEmptyTitle"));
            return;
        }

        const oClone = oSvg.cloneNode(true) as SVGSVGElement;
        Renderer.hardenSvgForDownload(oClone, oSvg); 

        const sSvgData = new XMLSerializer().serializeToString(oClone);
        const blob = new Blob([sSvgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `${oData.cdsName}_${oData.engine}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * @method onToggleFullScreen
     * @description Manages layout data to collapse/expand the control panel.
     * @public
     */
    public onToggleFullScreen(oEvent: Event): void {
        const oButton = oEvent.getSource() as Button;
        const oLeftPaneLayout = this.byId("leftPaneLayout") as SplitterLayoutData;
        
        if (oButton.getIcon() === "sap-icon://exit-full-screen") {
            oLeftPaneLayout.setSize("400px"); // Restore
            oButton.setIcon("sap-icon://full-screen");
        } else {
            oLeftPaneLayout.setSize("0px"); // Full canvas
            oButton.setIcon("sap-icon://exit-full-screen");
        }
    }

    /**
     * @method onCopySyntax
     * @description Transfers the diagram raw payload to the system clipboard.
     * @public
     */
    public onCopySyntax(): void {
        const sPayload: string = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/payload");
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show(this._getText("msgCopied")));
        }
    }

    /**
     * @method onDownloadSource
     * @description Exports the raw text syntax as a local file.
     * @public
     */
    public onDownloadSource(): void {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }

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
     * @description Centralized error feedback to the user.
     * @param {string} sMessage - Error text.
     * @private
     */
    private _showError(sMessage: string): void {
        const oMsgStrip = this.byId("msgError") as MessageStrip;
        oMsgStrip.setText(sMessage);
        oMsgStrip.setVisible(true);
        (this.byId("msgEmpty") as IllustratedMessage).setVisible(true);
    }

    /* =========================================================== */
    /* 4. VARIANT MANAGEMENT INTEGRATION                           */
    /* =========================================================== */

    /**
     * @method _loadHistoryAndVariants
     * @description Hydrates persistent history and variant models from storage.
     * @private
     */
    private _loadHistoryAndVariants(): void {
        this.getView()?.setModel(new JSONModel({ items: VariantManager.getHistory() }), "history");
        this.getView()?.setModel(new JSONModel({ items: VariantManager.getVariants() }), "variants");
    }

    /**
     * @method _updateHistory
     * @description Updates the search history persistence layer.
     * @private
     */
    private _updateHistory(sName: string): void {
        const aHistory = VariantManager.updateHistory(sName);
        (this.getView()?.getModel("history") as JSONModel).setProperty("/items", aHistory);
    }

    /**
     * @method onSaveVariant
     * @description Initiates the Variant Save workflow via dialog.
     * @public
     */
    public onSaveVariant(): void {
        const sCurrentVariant = (this.byId("selVariant") as Select).getSelectedKey() || "";
        const oInput = new Input({ value: sCurrentVariant, placeholder: this._getText("phVariantName") });

        const oDialog = new Dialog({
            title: this._getText("ttSaveVariant"),
            content: [oInput],
            beginButton: new Button({
                text: "Save",
                type: "Emphasized",
                press: () => this._handleSaveVariantDialogConfirm(oInput.getValue().trim(), oDialog)
            }),
            endButton: new Button({ text: "Cancel", press: () => oDialog.close() }),
            afterClose: () => oDialog.destroy()
        });

        oDialog.addStyleClass("sapUiContentPadding");
        this.getView()?.addDependent(oDialog);
        oDialog.open();
    }

    /**
     * @method _handleSaveVariantDialogConfirm
     * @description Validates name and checks for existing variants before executing save.
     * @private
     */
    private _handleSaveVariantDialogConfirm(sName: string, oDialog: Dialog): void {
        if (!sName) {
            MessageToast.show(this._getText("msgEnterName"));
            return;
        }

        const oModel = this.getView()?.getModel("variants") as JSONModel;
        const bExists = oModel.getProperty("/items").some((v: any) => v.name === sName);

        if (bExists) {
            MessageBox.confirm(
                this._getText("msgOverwriteText", [sName]),
                {
                    title: this._getText("msgOverwriteTitle"),
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: (sAction: string) => {
                        if (sAction === MessageBox.Action.YES) {
                            this._executeVariantSave(sName, oModel);
                            oDialog.close();
                        }
                    }
                }
            );
        } else {
            this._executeVariantSave(sName, oModel);
            oDialog.close();
        }
    }

    /**
     * @method _executeVariantSave
     * @description Serializes UI state and persists to local storage.
     * @private
     */
    private _executeVariantSave(sName: string, oModel: JSONModel): void {
        const oState = this._captureCurrentUiState(sName);
        const aVariants = VariantManager.saveVariant(oState);
        
        oModel.setProperty("/items", aVariants);
        (this.byId("selVariant") as Select).setSelectedKey(sName);

        MessageToast.show(this._getText("msgVariantSaved", [sName]));
    }

    /**
     * @method _captureCurrentUiState
     * @description Maps all UI control values into a standardized JSON state object.
     * @private
     */
    private _captureCurrentUiState(sName: string): any {
        const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();

        return {
            name: sName,
            cdsName: (this.byId("cmbCdsName") as ComboBox).getValue().trim(),
            engine: (this.byId("selEngine") as Select).getSelectedKey(),
            maxLevel: (this.byId("stepMaxLevel") as StepInput).getValue(),
            keys: (this.byId("swKeys") as Switch).getState(),
            fields: (this.byId("swFields") as Switch).getState(),
            assocFields: (this.byId("swAssocFields") as Switch).getState(),
            base: (this.byId("swBase") as Switch).getState(),
            customOnly: (this.byId("swCustomOnly") as Switch).getState(),
            relMode: (this.byId("segRelMode") as SegmentedButton).getSelectedKey(),
            discAssoc: (this.byId("swDiscAssoc") as Switch).getState(),
            discComp: (this.byId("swDiscComp") as Switch).getState(),
            discInherit: (this.byId("swDiscInherit") as Switch).getState(),
            lineAssoc: (this.byId("swLineAssoc") as Switch).getState(),
            lineComp: (this.byId("swLineComp") as Switch).getState(),
            lineInherit: (this.byId("swLineInherit") as Switch).getState(),
            includeCds: aIncTokens.map(t => t.getText()).join(","),
            excludeCds: aExcTokens.map(t => t.getText()).join(",")
        };
    }

    /**
     * @method onDeleteVariant
     * @description Removes a variant from local persistence.
     * @public
     */
    public onDeleteVariant(): void {
        const sSelectedName = (this.byId("selVariant") as Select).getSelectedKey();
        if (!sSelectedName) return;

        const aVariants = VariantManager.deleteVariant(sSelectedName);
        (this.getView()?.getModel("variants") as JSONModel).setProperty("/items", aVariants);

        MessageToast.show(this._getText("msgVariantDeleted", [sSelectedName]));
    }

    /**
     * @method onVariantChange
     * @description Handles variant selection. Re-hydrates UI state and token lists.
     * @param {Event} oEvent - Selection event.
     * @public
     */
    public onVariantChange(oEvent: Event): void {
        const sSelectedName = (oEvent.getSource() as Select).getSelectedKey();
        const oModel = this.getView()?.getModel("variants") as JSONModel;
        const aVariants: any[] = oModel.getProperty("/items");
        const oVariant = aVariants.find(v => v.name === sSelectedName);

        if (oVariant) {
            // Restore standard control values
            (this.byId("cmbCdsName") as ComboBox).setValue(oVariant.cdsName || "");
            (this.byId("selEngine") as Select).setSelectedKey(oVariant.engine);
            (this.byId("stepMaxLevel") as StepInput).setValue(oVariant.maxLevel);
            (this.byId("swKeys") as Switch).setState(oVariant.keys);
            (this.byId("swFields") as Switch).setState(oVariant.fields);
            (this.byId("swAssocFields") as Switch).setState(oVariant.assocFields);
            (this.byId("swBase") as Switch).setState(oVariant.base);
            (this.byId("swCustomOnly") as Switch).setState(oVariant.customOnly);
            
            // Restore Mutually Exclusive Relationship Modes 
            const sMode = oVariant.relMode || "LINES";
            (this.byId("segRelMode") as SegmentedButton).setSelectedKey(sMode);
            (this.byId("boxLines") as VBox).setVisible(sMode === "LINES");
            (this.byId("boxDiscovery") as VBox).setVisible(sMode !== "LINES");

            // Restore Toggle states with nullish coalescing for safety
            (this.byId("swDiscAssoc") as Switch).setState(oVariant.discAssoc ?? true);
            (this.byId("swDiscComp") as Switch).setState(oVariant.discComp ?? true);
            (this.byId("swDiscInherit") as Switch).setState(oVariant.discInherit ?? true);
            (this.byId("swLineAssoc") as Switch).setState(oVariant.lineAssoc ?? true);
            (this.byId("swLineComp") as Switch).setState(oVariant.lineComp ?? true);
            (this.byId("swLineInherit") as Switch).setState(oVariant.lineInherit ?? true);
            
            // Re-build visual Tokens from saved comma-separated strings
            const oIncInput = this.byId("inpInclude") as MultiInput;
            const oExcInput = this.byId("inpExclude") as MultiInput;
            
            oIncInput.removeAllTokens();
            if (oVariant.includeCds) {
                oVariant.includeCds.split(",").forEach((s: string) => {
                    if (s.trim()) oIncInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
                });
            }

            oExcInput.removeAllTokens();
            if (oVariant.excludeCds) {
                oVariant.excludeCds.split(",").forEach((s: string) => {
                    if (s.trim()) oExcInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
                });
            }

            MessageToast.show(this._getText("msgVariantApplied", [oVariant.name]));
        }
    }

    /**
     * @method _getText
     * @description Abstraction for i18n bundle access. 
     * Falls back to the Component model if the View model is not yet hydrated.
     * @param {string} sKey - The resource bundle key.
     * @param {any[]} [aArgs] - Placeholder arguments.
     * @returns {string} The localized text.
     * @private
     */
    private _getText(sKey: string, aArgs?: any[]): string {
        const oView = this.getView();
        let oResourceBundle = (oView?.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle;
        
        if (!oResourceBundle) {
            oResourceBundle = (this.getOwnerComponent()?.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle;
        }

        return oResourceBundle ? oResourceBundle.getText(sKey, aArgs) || sKey : sKey;
    }
}