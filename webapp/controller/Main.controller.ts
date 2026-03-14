/**
 * @fileoverview Main Controller for VDM Diagram Generator.
 * @version 1.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 * * Logic Summary:
 * - Coordinates application state and UI event handling.
 * - Manages OData V4 communication and request filtering.
 * - Orchestrates diagram rendering by delegating to utility modules.
 * - Handles local storage persistence for search history and variants.
 * - Provides export functionality for multiple file formats.
 */
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import File from "sap/ui/core/util/File";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Event from "sap/ui/base/Event";

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
import Icon from "sap/ui/core/Icon"; // Ensure the Icon namespace is properly imported for TS compilation

import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

// Custom Utility Classes
import VariantManager from "../util/VariantManager";
import Renderer from "../util/Renderer";

export default class Main extends Controller {

    // Cache the popover so we don't create a new DOM element on every info icon click
    private _oInfoPopover: ResponsivePopover | null = null;

    /**
     * Controller initialization. Sets up base models, validators, and user history.
     */
    public onInit(): void {
        // UI Model handles transient screen state (like showing/hiding context help)
        // Default is false so advanced users aren't bothered by icons
        this.getView()?.setModel(new JSONModel({
            showHelp: false
        }), "ui");

        // This JSONModel stores the raw diagram payload required for the Download/Copy actions
        this.getView()?.setModel(new JSONModel({
            payload: "", extension: "", cdsName: "", engine: ""
        }), "diagramData");

        // Wire up validators for the Include/Exclude MultiInputs.
        // This function intercepts text when the user presses 'Enter' and turns it into a visual UI Token.
        const fnTokenValidator = (args: { text: string }) => {
            const sCleanText = args.text.trim().toUpperCase();
            
            // Validation 1: Block Wildcards (Requires full CDS names)
            if (sCleanText.includes("*") || sCleanText.includes("%")) {
                MessageToast.show(this._getText("msgWildcardWarn"));
                return null; // Reject the token creation
            }
            if (!sCleanText) return null;

            // Validation 2: Block Duplicate Tokens (IMPROVEMENT)
            // Checks both lists to ensure uniqueness globally.
            const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
            const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();
            const bIsDuplicate = [...aIncTokens, ...aExcTokens].some(t => t.getKey() === sCleanText);
            
            if (bIsDuplicate) {
                MessageToast.show(this._getText("msgDuplicateWarn"));
                return null;
            }
            
            // Return a valid SAP Token object
            return new Token({ key: sCleanText, text: sCleanText });
        };
        
        (this.byId("inpInclude") as MultiInput).addValidator(fnTokenValidator);
        (this.byId("inpExclude") as MultiInput).addValidator(fnTokenValidator);

        this._loadHistoryAndVariants();
    }

    /* =========================================================== */
    /* 1. ODATA V4 GENERATION LOGIC                                */
    /* =========================================================== */

    /**
     * Primary event handler for the "Generate Diagram" button.
     * Validates input, builds the OData request, and routes to the rendering engine.
     */
    public onGenerate(): void {
        const sCdsName = (this.byId("cmbCdsName") as ComboBox).getValue().trim().toUpperCase();
        if (!sCdsName) {
            MessageToast.show(this._getText("msgEnterCds"));
            return;
        }

        const sEngine = (this.byId("selEngine") as Select).getSelectedKey();
        this._resetCanvasState();
        
        // Show busy indicator to block user interaction during the backend call
        BusyIndicator.show(0);

        const aFilters = this._buildODataFilters(sCdsName, sEngine);
        
        // In OData V4, we don't use `.read()`. We create a list binding, apply filters, and request contexts.
        const oListBinding = (this.getView()?.getModel() as ODataModel).bindList("/Diagram") as ODataListBinding;
        oListBinding.filter(aFilters);
        
        // Execute OData Request
        oListBinding.requestContexts(0, 1)
            .then((aContexts: any[]) => this._handleGenerationSuccess(aContexts, sCdsName, sEngine))
            .catch((oError: Error) => {
                this._showError(this._getText("msgReqFailed", [oError.message]));
            })
            .finally(() => {
                // IMPROVEMENT: Guarantee the BusyIndicator always hides, even if an exception occurs in the chain.
                BusyIndicator.hide();
            });
    }

    /**
     * Helper to process the successful OData V4 response payload.
     */
    private _handleGenerationSuccess(aContexts: any[], sCdsName: string, sEngine: string): void {
        if (!aContexts || aContexts.length === 0) {
            this._showError(this._getText("msgNoMeta"));
            return;
        }

        // Extract the entity object from the V4 Context
        const oResult = aContexts[0].getObject();

        // Trap Custom ABAP-level errors returned dynamically inside the text payload
        if (oResult.DiagramPayload.startsWith("Error:")) {
            this._showError(oResult.DiagramPayload.replace("Error: ", ""));
            return;
        }

        this._updateHistory(sCdsName);
        this._bindDownloadData(oResult, sEngine);

        // Display the action toolbar (Copy/Download buttons)
        (this.byId("toolbarActions") as Toolbar).setVisible(true);
        (this.byId("btnDownloadImg") as Button).setVisible(sEngine !== "D2");

        // D2 cannot be rendered in the browser natively via WASM yet. Warn the user to download it.
        if (sEngine === "D2") {
            this._showError(this._getText("msgD2Warning"));
            return;
        }

        const oHtml = this.byId("htmlRenderer") as HTML;
        oHtml.setVisible(true);

        // Hand off complex rendering logic to the modular Utility class
        Renderer.renderDiagram(sEngine, oResult.DiagramPayload, oHtml, (sMsg: string) => this._showError(sMsg));
    }

    /**
     * Reads all current UI inputs and converts them into OData Filters for the backend.
     * Enforces mutual exclusivity: If in "Lines" mode, "Discovery" parameters are forced to false, and vice versa.
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
            
            // MUTUAL EXCLUSION LOGIC:
            // If in Lines mode, send actual Line states, otherwise send strict false.
            new Filter("LineAssoc", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineAssoc") as Switch).getState() : false),
            new Filter("LineComp", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineComp") as Switch).getState() : false),
            new Filter("LineInherit", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineInherit") as Switch).getState() : false),

            // If in Discovery mode, send actual Disc states, otherwise send strict false.
            new Filter("DiscAssoc", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscAssoc") as Switch).getState() : false),
            new Filter("DiscComp", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscComp") as Switch).getState() : false),
            new Filter("DiscInherit", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscInherit") as Switch).getState() : false)
        ];

        // Map visual Tokens back into a comma-separated string for the ABAP backend string parameters
        const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();
        const sInclude = aIncTokens.map(t => t.getText()).join(",");
        const sExclude = aExcTokens.map(t => t.getText()).join(",");

        if (sInclude) aFilters.push(new Filter("IncludeCds", FilterOperator.EQ, sInclude));
        if (sExclude) aFilters.push(new Filter("ExcludeCds", FilterOperator.EQ, sExclude));

        return aFilters;
    }

    /**
     * Caches the payload and metadata locally so the Download/Copy buttons can access them later without re-triggering OData.
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
    /* UI EVENTS & WORKFLOW ACTIONS                                */
    /* =========================================================== */

    /**
     * Dynamically creates and displays a localized info popover next to the clicked icon.
     * * DESIGN RATIONALE: Single reuseable method driven by `customData:infoType` keeps XML clean.
     */
    public onShowInfo(oEvent: Event): void {
        const oIcon = oEvent.getSource() as Icon;
        // Retrieve the customData key we set in the XML (e.g., "ShowKeys", "RelMode")
        const sInfoType = oIcon.data("infoType") as string;
        
        // Fetch the corresponding text dynamically from i18n
        const sTitle = this._getText(`infoTitle${sInfoType}`);
        const sText = this._getText(`infoText${sInfoType}`);

        // Lazy load the popover to save memory on initial app load
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

        // Update the popover content model and title, then open it directly next to the icon
        this._oInfoPopover.setModel(new JSONModel({ text: sText }), "popover");
        this._oInfoPopover.setTitle(sTitle);
        this._oInfoPopover.openBy(oIcon);
    }


    /**
     * Event handler for PNG export.
     */
    public async onDownloadPng(): Promise<void> {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg");

        if (!oSvg) {
            MessageToast.show(this._getText("msgEmptyTitle"));
            return;
        }

        BusyIndicator.show(0);

        try {
            // 1. Clone and "harden" the SVG exactly like we do for SVG export
            const oClone = oSvg.cloneNode(true) as SVGSVGElement;
            Renderer.hardenSvgForDownload(oClone, oSvg);

            // 2. Convert to PNG Blob via Utility
            const oPngBlob = await Renderer.convertSvgToPng(oClone);

            // 3. Trigger Download
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
     * Toggles the visibility of the granular switches based on the selected Relationship Mode.
     */
    public onRelModeChange(oEvent: Event): void {
        const sSelectedMode = (oEvent.getSource() as SegmentedButton).getSelectedKey();
        const oBoxLines = this.byId("boxLines") as VBox;
        const oBoxDisc = this.byId("boxDiscovery") as VBox;
        
        if (sSelectedMode === "LINES") {
            oBoxLines.setVisible(true);
            oBoxDisc.setVisible(false);
        } else {
            oBoxLines.setVisible(false);
            oBoxDisc.setVisible(true);
        }
    }

    /**
     * Triggers the local download of the SVG Canvas image.
     */
    public onDownloadImage(): void {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg");

        if (!oSvg) {
            MessageToast.show(this._getText("msgEmptyTitle"));
            return;
        }

        const oClone = oSvg.cloneNode(true) as SVGSVGElement;
        Renderer.hardenSvgForDownload(oClone, oSvg); // Clean up D3 transforms via Utility

        // Serialize and trigger standard browser blob download
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
     * Expands the right-pane canvas to cover the whole screen by collapsing the left control panel.
     */
    public onToggleFullScreen(oEvent: Event): void {
        const oButton = oEvent.getSource() as Button;
        const oLeftPaneLayout = this.byId("leftPaneLayout") as SplitterLayoutData;
        
        if (oButton.getIcon() === "sap-icon://exit-full-screen") {
            oLeftPaneLayout.setSize("400px"); // Restore left panel
            oButton.setIcon("sap-icon://full-screen");
        } else {
            oLeftPaneLayout.setSize("0px"); // Collapse left panel
            oButton.setIcon("sap-icon://exit-full-screen");
        }
    }

    /**
     * Writes the raw text payload to the user's clipboard.
     */
    public onCopySyntax(): void {
        const sPayload: string = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/payload");
        if (navigator && navigator.clipboard) {
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show(this._getText("msgCopied")));
        }
    }

    /**
     * Downloads the raw text payload as a .mmd, .dot, .puml, or .d2 file.
     */
    public onDownloadSource(): void {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
        // File.save is a native UI5 core utility for handling text blobs cross-browser
        File.save(oData.payload, oData.cdsName, oData.extension.substring(1), "text/plain", "utf-8");
    }

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

    /* =========================================================== */
    /* VARIANT MANAGEMENT INTEGRATION                              */
    /* =========================================================== */

    private _loadHistoryAndVariants(): void {
        this.getView()?.setModel(new JSONModel({ items: VariantManager.getHistory() }), "history");
        this.getView()?.setModel(new JSONModel({ items: VariantManager.getVariants() }), "variants");
    }

    private _updateHistory(sName: string): void {
        const aHistory = VariantManager.updateHistory(sName);
        (this.getView()?.getModel("history") as JSONModel).setProperty("/items", aHistory);
    }

    /**
     * Initiates the Variant Save workflow. Opens a dialog to name the configuration.
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
            afterClose: () => oDialog.destroy() // Destroy prevents DOM ID duplicates if reopened
        });

        oDialog.addStyleClass("sapUiContentPadding");
        this.getView()?.addDependent(oDialog);
        oDialog.open();
    }

    /**
     * Evaluates the requested variant name. Prompts for overwrite if it already exists.
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

    private _executeVariantSave(sName: string, oModel: JSONModel): void {
        const oState = this._captureCurrentUiState(sName);
        const aVariants = VariantManager.saveVariant(oState); // Write via Static Utility
        
        oModel.setProperty("/items", aVariants);
        (this.byId("selVariant") as Select).setSelectedKey(sName);

        MessageToast.show(this._getText("msgVariantSaved", [sName]));
    }

    /**
     * Reads all left-pane inputs and switches into a standardized JSON object.
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

    public onDeleteVariant(): void {
        const sSelectedName = (this.byId("selVariant") as Select).getSelectedKey();
        if (!sSelectedName) return;

        const aVariants = VariantManager.deleteVariant(sSelectedName);
        (this.getView()?.getModel("variants") as JSONModel).setProperty("/items", aVariants);

        MessageToast.show(this._getText("msgVariantDeleted", [sSelectedName]));
    }

    /**
     * Restores UI state when a user selects a variant from the dropdown.
     */
    public onVariantChange(oEvent: Event): void {
        const sSelectedName = (oEvent.getSource() as Select).getSelectedKey();
        const aVariants: any[] = (this.getView()?.getModel("variants") as JSONModel).getProperty("/items");
        const oVariant = aVariants.find(v => v.name === sSelectedName);

        if (oVariant) {
            (this.byId("cmbCdsName") as ComboBox).setValue(oVariant.cdsName || "");
            (this.byId("selEngine") as Select).setSelectedKey(oVariant.engine);
            (this.byId("stepMaxLevel") as StepInput).setValue(oVariant.maxLevel);
            (this.byId("swKeys") as Switch).setState(oVariant.keys);
            (this.byId("swFields") as Switch).setState(oVariant.fields);
            (this.byId("swAssocFields") as Switch).setState(oVariant.assocFields);
            (this.byId("swBase") as Switch).setState(oVariant.base);
            (this.byId("swCustomOnly") as Switch).setState(oVariant.customOnly);
            
            // Restore Mutually Exclusive Mode (Fallback to LINES for old variants)
            const sMode = oVariant.relMode || "LINES";
            (this.byId("segRelMode") as SegmentedButton).setSelectedKey(sMode);
            
            // Manually trigger the view toggle to match the state
            if (sMode === "LINES") {
                (this.byId("boxLines") as VBox).setVisible(true);
                (this.byId("boxDiscovery") as VBox).setVisible(false);
            } else {
                (this.byId("boxLines") as VBox).setVisible(false);
                (this.byId("boxDiscovery") as VBox).setVisible(true);
            }

            // Default to true for backward compatibility on older variants missing these properties
            (this.byId("swDiscAssoc") as Switch).setState(oVariant.discAssoc !== undefined ? oVariant.discAssoc : true);
            (this.byId("swDiscComp") as Switch).setState(oVariant.discComp !== undefined ? oVariant.discComp : true);
            (this.byId("swDiscInherit") as Switch).setState(oVariant.discInherit !== undefined ? oVariant.discInherit : true);

            (this.byId("swLineAssoc") as Switch).setState(oVariant.lineAssoc !== undefined ? oVariant.lineAssoc : true);
            (this.byId("swLineComp") as Switch).setState(oVariant.lineComp !== undefined ? oVariant.lineComp : true);
            (this.byId("swLineInherit") as Switch).setState(oVariant.lineInherit !== undefined ? oVariant.lineInherit : true);
            
            // Re-build visual Tokens from saved comma-separated strings
            const oIncInput = this.byId("inpInclude") as MultiInput;
            const oExcInput = this.byId("inpExclude") as MultiInput;
            
            oIncInput.removeAllTokens();
            if (oVariant.includeCds) {
                oVariant.includeCds.split(",").forEach((sTokenText: string) => {
                    if (sTokenText.trim()) oIncInput.addToken(new Token({ key: sTokenText.trim(), text: sTokenText.trim() }));
                });
            }

            oExcInput.removeAllTokens();
            if (oVariant.excludeCds) {
                oVariant.excludeCds.split(",").forEach((sTokenText: string) => {
                    if (sTokenText.trim()) oExcInput.addToken(new Token({ key: sTokenText.trim(), text: sTokenText.trim() }));
                });
            }

            // Put this back! It will now say: Variant "Default BP View" applied.
            MessageToast.show(this._getText("msgVariantApplied", [oVariant.name]));
         
        }
    }

    /**
     * Helper to read strings safely from the i18n file.
     * IMPROVEMENT: Falls back to the Component's i18n model if the View model isn't ready.
     */
    private _getText(sKey: string, aArgs?: any[]): string {
        let oResourceBundle = (this.getView()?.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle;
        
        // Fallback for edge cases where view model isn't bound yet during early initialization
        if (!oResourceBundle) {
            oResourceBundle = (this.getOwnerComponent()?.getModel("i18n") as ResourceModel)?.getResourceBundle() as ResourceBundle;
        }

        return oResourceBundle ? oResourceBundle.getText(sKey, aArgs) || sKey : sKey;
    }
}