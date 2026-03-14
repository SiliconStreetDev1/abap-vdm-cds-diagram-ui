/**
 * @fileoverview VDM Diagram Generator Main Controller
 * @version 1.0.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 * * Includes open-source components: Mermaid.js (MIT), D3.js (ISC), 
 * d3-graphviz (BSD-3), @hpcc-js/wasm (Apache-2.0), Pako (MIT).
 * See THIRD_PARTY_NOTICES.md for details.
 */
import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import File from "sap/ui/core/util/File";
import BusyIndicator from "sap/ui/core/BusyIndicator";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Event from "sap/ui/base/Event";

// UI Controls
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

// OData Framework
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

// Ambient declarations for external libraries injected via CDN
declare const mermaid: any;
declare const d3: any;
declare const pako: any;

/**
 * Global Configuration Constants.
 * Centralizing these prevents magic strings and makes future upgrades easier.
 */
const CONFIG = {
    URL_PLANTUML_SERVER: "https://www.plantuml.com/plantuml/svg/",
    MAX_URL_LENGTH: 7000, // Hard limit to prevent HTTP 414 URL Too Long errors
    DOM_POLL_INTERVAL_MS: 50,
    DOM_POLL_MAX_ATTEMPTS: 20,
    CDN: {
        MERMAID: "https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js",
        D3: "https://d3js.org/d3.v7.min.js",
        GRAPHVIZ_WASM: "https://unpkg.com/@hpcc-js/wasm@2.14.1/dist/graphviz.umd.js",
        GRAPHVIZ_PLUGIN: "https://unpkg.com/d3-graphviz@5.1.0/build/d3-graphviz.min.js",
        PAKO: "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js"
    }
};

export default class Main extends Controller {

    // Cache for loaded script promises to prevent duplicate network requests
    private _scriptPromises: Record<string, Promise<void> | undefined> = {};

    // Flag to ensure Mermaid.js is only initialized once per browser session
    private _bMermaidInit: boolean = false;

    /**
     * Controller initialization. Sets up base models and loads user preferences from local storage.
     */
    public onInit(): void {
        this._scriptPromises = {};

        // This model stores the raw payload and state required for the Download/Copy actions
        this.getView()?.setModel(new JSONModel({
            payload: "", extension: "", cdsName: "", engine: ""
        }), "diagramData");

        // Wire up validators so typing text and pressing Enter creates a visual Token.
        // Enforces strict CDS names and blocks wildcards.
        const fnTokenValidator = (args: { text: string }) => {
            const sCleanText = args.text.trim().toUpperCase();
            
            if (sCleanText.includes("*") || sCleanText.includes("%")) {
                MessageToast.show("Wildcards are not supported. Please enter the full CDS view name.");
                return null; // Reject the token creation
            }
            
            if (!sCleanText) {
                return null;
            }
            
            return new Token({ key: sCleanText, text: sCleanText });
        };
        
        (this.byId("inpInclude") as MultiInput).addValidator(fnTokenValidator);
        (this.byId("inpExclude") as MultiInput).addValidator(fnTokenValidator);

        this._loadHistory();
        this._loadVariants();
    }

    /* =========================================================== */
    /* 1. ODATA GENERATION LOGIC                                   */
    /* =========================================================== */

    /**
     * Primary event handler for the "Generate Diagram" button.
     * Validates input, builds the OData request, and routes to the appropriate engine.
     */
    public onGenerate(): void {
        const sCdsName = (this.byId("cmbCdsName") as ComboBox).getValue().trim().toUpperCase();
        if (!sCdsName) {
            MessageToast.show("Please enter a CDS View Name.");
            return;
        }

        const sEngine = (this.byId("selEngine") as Select).getSelectedKey();
        this._resetCanvasState();
        BusyIndicator.show(0);

        const aFilters = this._buildODataFilters(sCdsName, sEngine);
        const oListBinding = (this.getView()?.getModel() as ODataModel).bindList("/Diagram") as ODataListBinding;

        // Execute OData Request
        oListBinding.filter(aFilters);
        oListBinding.requestContexts(0, 1)
            .then((aContexts: any[]) => this._handleGenerationSuccess(aContexts, sCdsName, sEngine))
            .catch((oError: Error) => {
                BusyIndicator.hide();
                this._showError(`HTTP Request Failed: ${oError.message}`);
            });
    }

    /**
     * Helper to process the successful OData response.
     * @param aContexts Array of returned OData contexts.
     * @param sCdsName The requested CDS name.
     * @param sEngine The requested rendering engine.
     */
    private _handleGenerationSuccess(aContexts: any[], sCdsName: string, sEngine: string): void {
        BusyIndicator.hide();

        if (!aContexts || aContexts.length === 0) {
            this._showError("No metadata found for this entity.");
            return;
        }

        const oResult = aContexts[0].getObject();

        // Trap ABAP-level errors returned as text payloads
        if (oResult.DiagramPayload.startsWith("Error:")) {
            this._showError(oResult.DiagramPayload.replace("Error: ", ""));
            return;
        }

        this._updateHistory(sCdsName);
        this._bindDownloadData(oResult, sEngine);

        // Display toolbar and route payload to the visual engine
        (this.byId("toolbarActions") as Toolbar).setVisible(true);
        (this.byId("btnDownloadImg") as Button).setVisible(sEngine !== "D2");

        this._routeToEngine(oResult.DiagramPayload, sEngine);
    }

    /**
     * Reads all current UI inputs and converts them into OData Filters for the backend.
     * Enforces mutual exclusivity: If in Lines mode, Discovery is forced false, and vice versa.
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
            
            // If in Lines mode, send actual Line states, otherwise send false.
            new Filter("LineAssoc", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineAssoc") as Switch).getState() : false),
            new Filter("LineComp", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineComp") as Switch).getState() : false),
            new Filter("LineInherit", FilterOperator.EQ, bIsLinesMode ? (this.byId("swLineInherit") as Switch).getState() : false),

            // If in Discovery mode, send actual Disc states, otherwise send false.
            new Filter("DiscAssoc", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscAssoc") as Switch).getState() : false),
            new Filter("DiscComp", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscComp") as Switch).getState() : false),
            new Filter("DiscInherit", FilterOperator.EQ, !bIsLinesMode ? (this.byId("swDiscInherit") as Switch).getState() : false)
        ];

        // Map visual Tokens to a comma-separated string for the ABAP backend
        const aIncTokens = (this.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (this.byId("inpExclude") as MultiInput).getTokens();
        const sInclude = aIncTokens.map(t => t.getText()).join(",");
        const sExclude = aExcTokens.map(t => t.getText()).join(",");

        if (sInclude) aFilters.push(new Filter("IncludeCds", FilterOperator.EQ, sInclude));
        if (sExclude) aFilters.push(new Filter("ExcludeCds", FilterOperator.EQ, sExclude));

        return aFilters;
    }

    /**
     * Caches the payload and metadata so the Download/Copy buttons can access them later.
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
    /* 2. ENGINE ROUTING & STABLE CANVAS LIFECYCLE                 */
    /* =========================================================== */

    /**
     * Determines which rendering engine to use and ensures the DOM is prepared.
     */
    private _routeToEngine(sPayload: string, sEngine: string): void {
        if (sEngine === "D2") {
            this._showError("D2 format requires a local CLI engine to compile. Use Toolbar to Download or Copy.");
            return;
        }

        const oHtml = this.byId("htmlRenderer") as HTML;
        oHtml.setVisible(true);

        // Prepares a stable DOM container before triggering the specific engine logic
        this._setupCanvas(oHtml, (sRenderId: string) => {
            switch (sEngine) {
                case "MERMAID":
                    this._renderMermaid(sPayload, sRenderId);
                    break;
                case "GRAPHVIZ":
                    this._renderGraphviz(sPayload, sRenderId);
                    break;
                case "PLANTUML":
                    this._renderPlantUML(sPayload, sRenderId);
                    break;
            }
        });
    }

    /**
     * Secures a stable HTML container and generates a unique rendering div.
     * Wiping the parent innerHTML first ensures old WASM workers/SVG elements are garbage collected.
     */
    private _setupCanvas(oHtml: HTML, fnCallback: (sRenderId: string) => void): void {
        const sParentId = "vdmCanvasContainer";

        // Inject the stable parent container only once.
        // FIX: height is now 100% to inherit the full size of the Splitter container.
        if (!oHtml.getContent()) {
            oHtml.setContent(`<div id="${sParentId}" style="width:100%; height:100%; overflow:hidden; display:flex; justify-content:center; align-items:center;"></div>`);
        }

        // Poll the DOM to ensure SAPUI5 has actually painted the element to the screen
        let iAttempts = 0;
        const timer = setInterval(() => {
            const oParentDiv = document.getElementById(sParentId);
            iAttempts++;

            if (oParentDiv) {
                clearInterval(timer);

                // Hard-wipe the container to prevent visual overlap and memory leaks
                oParentDiv.innerHTML = "";

                // Create a unique ID for this specific render to bypass engine caching issues
                const sRenderId = "render-" + Date.now();
                oParentDiv.innerHTML = `<div id="${sRenderId}" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center;"></div>`;

                fnCallback(sRenderId);
            } else if (iAttempts >= CONFIG.DOM_POLL_MAX_ATTEMPTS) {
                clearInterval(timer);
                this._showError("Failed to render: UI5 DOM container timed out.");
            }
        }, CONFIG.DOM_POLL_INTERVAL_MS);
    }

    /* =========================================================== */
    /* 3. VISUAL RENDERING ENGINES                                 */
    /* =========================================================== */

    /**
     * Renders Mermaid diagrams directly into the DOM as an SVG.
     */
    private _renderMermaid(sPayload: string, sRenderId: string): void {
        this._loadScript(CONFIG.CDN.MERMAID).then(() => {
            try {
                if (!this._bMermaidInit) {
                    mermaid.mermaidAPI.initialize({ startOnLoad: false, theme: 'default' });
                    this._bMermaidInit = true;
                }
                const sSvgId = "mermaid-svg-" + Date.now();
                mermaid.mermaidAPI.render(sSvgId, sPayload, (svgCode: string) => {
                    const oTarget = document.getElementById(sRenderId);
                    if (oTarget) {
                        oTarget.innerHTML = svgCode;
                        this._attachSvgZoom(sRenderId);
                    }
                });
            } catch (e: any) {
                this._showError(`Mermaid Syntax Error: ${e.message || e}`);
            }
        });
    }

    /**
     * Renders Graphviz using D3.js and a WASM worker.
     * Applies critical fixes to bypass math crashes on massive datasets.
     */
    private async _renderGraphviz(sPayload: string, sRenderId: string): Promise<void> {
        try {
            await this._loadScript(CONFIG.CDN.D3);
            await this._loadScript(CONFIG.CDN.GRAPHVIZ_WASM);
            await this._loadScript(CONFIG.CDN.GRAPHVIZ_PLUGIN);

            // sanity check
            if (typeof d3.select("body").graphviz !== "function") {
                throw new Error("d3-graphviz failed to attach to d3");
            }

            d3.select(`#${sRenderId}`)
                .graphviz()
                .tweenPaths(false)
                .tweenShapes(false)
                .zoom(true)
                .zoomScaleExtent([0.001, 100])
                .fit(true)
                .renderDot(sPayload);

        } catch (e: any) {
            this._showError(`Graphviz Error: ${e.message}`);
        }
    }

    /**
     * Compresses the payload via Zlib deflate, encodes to custom Base64, and fetches the SVG.
     */
    private _renderPlantUML(sPayload: string, sRenderId: string): void {
        this._loadScript(CONFIG.CDN.PAKO).then(() => {
            try {
                // Encode using DeflateRAW (no headers) to meet PlantUML server requirements
                const utf8Bytes = new TextEncoder().encode(sPayload);
                const deflated = pako.deflateRaw(utf8Bytes, { level: 9 });
                const encoded = this._encode64(deflated);

                if (encoded.length > CONFIG.MAX_URL_LENGTH) {
                    this._showError(`Diagram is too massive for the public PlantUML server. Please use Mermaid or Graphviz, or download the PlantUML source code.`);
                    return;
                }

                // Fetch the SVG natively to allow D3 zooming and downloading
                fetch(`${CONFIG.URL_PLANTUML_SERVER}${encoded}`)
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}: Server rejected request.`);
                        return response.text();
                    })
                    .then(svgText => this._processPlantUmlSvg(svgText, sRenderId))
                    .catch(err => this._showError(`PlantUML Network Error: ${err.message}.`));

            } catch (e: any) {
                this._showError(`PlantUML Encoding Error: ${e.message}`);
            }
        });
    }

    /**
     * Helper to clean and inject the PlantUML SVG response.
     */
    private _processPlantUmlSvg(svgText: string, sRenderId: string): void {
        // FIX: PlantUML embeds base64 source code inside an XML comment.
        // If it contains a double-hyphen '--', strict browser XML parsers crash.
        // We safely strip out all comments using a dynamic regex to avoid compiler confusion.
        const sCommentStart = "<" + "!--";
        const sCommentEnd = "--" + ">";
        const rxComments = new RegExp(sCommentStart + "[\\s\\S]*?" + sCommentEnd, "g");

        const cleanSvg = svgText.replace(rxComments, "");

        const oTarget = document.getElementById(sRenderId);
        if (oTarget) {
            oTarget.innerHTML = cleanSvg;
            this._attachSvgZoom(sRenderId);
        }
    }

    /* =========================================================== */
    /* 4. D3 ZOOM & PAN BEHAVIOR                                   */
    /* =========================================================== */

    /**
     * Automatically binds D3 mouse-wheel zoom and click-and-drag panning to inline SVGs.
     */
    private _attachSvgZoom(sRenderId: string): void {
        this._loadScript(CONFIG.CDN.D3).then(() => {
            setTimeout(() => {
                const svg = d3.select(`#${sRenderId} svg`);
                if (svg.empty()) return;

                svg.attr("width", "100%").attr("height", "100%");

                const zoom = d3.zoom()
                    .scaleExtent([0.05, 50])
                    .on("zoom", (event: any) => {
                        // Apply transformations to the main <g> tag within the SVG
                        svg.select("g").attr("transform", event.transform);
                    });

                svg.call(zoom);

                // UX refinement: Double-click resets the camera
                svg.on("dblclick.zoom", () => {
                    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
                });
            }, 100);
        });
    }

    /* =========================================================== */
    /* 5. DOWNLOAD & UI WORKFLOW ACTIONS                           */
    /* =========================================================== */

    /**
     * Toggles the visibility of the granular switches based on the selected mode.
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
     * Extracts the SVG, resets view boundaries, enforces XML namespaces, and initiates file download.
     */
    public onDownloadImage(): void {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
        const oSvg = document.getElementById("vdmCanvasContainer")?.querySelector("svg");

        if (!oSvg) {
            MessageToast.show("No SVG found to download.");
            return;
        }

        const oClone = oSvg.cloneNode(true) as SVGSVGElement;
        this._hardenSvgForDownload(oClone, oSvg);

        // Serialize and trigger blob download
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
     * Prepares an SVG clone for external viewing by cleaning up internal D3 state and enforcing dimensions.
     */
    private _hardenSvgForDownload(oClone: SVGSVGElement, oOriginalSvg: SVGSVGElement): void {
        // Enforce namespaces so desktop image viewers (Illustrator, Edge) don't reject the file
        if (!oClone.getAttribute("xmlns")) oClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        if (!oClone.getAttribute("xmlns:xlink")) oClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

        // Wipe D3 transforms. Ensures the downloaded image isn't offset with huge white borders.
        const oRootGroup = oClone.querySelector("g");
        if (oRootGroup) oRootGroup.removeAttribute("transform");

        // Enforce absolute pixels so the file doesn't collapse to 0x0
        if (oClone.hasAttribute("viewBox")) {
            const aViewBox = oClone.getAttribute("viewBox")!.split(/[\s,]+/);
            if (aViewBox.length >= 4) {
                oClone.setAttribute("width", `${aViewBox[2]}px`);
                oClone.setAttribute("height", `${aViewBox[3]}px`);
            }
        } else {
            const sWidth = oClone.getAttribute("width");
            if (!sWidth || sWidth.includes("%")) {
                try {
                    // Fallback: Dynamically measure the physical shapes to generate a bounding box
                    const oBBox = oOriginalSvg.getBBox();
                    if (oBBox && oBBox.width > 0) {
                        const pad = 20;
                        oClone.setAttribute("viewBox", `0 0 ${oBBox.width + (pad * 2)} ${oBBox.height + (pad * 2)}`);
                        oClone.setAttribute("width", `${oBBox.width + (pad * 2)}px`);
                        oClone.setAttribute("height", `${oBBox.height + (pad * 2)}px`);
                    }
                } catch (e) {
                    oClone.setAttribute("width", "3000px");
                    oClone.setAttribute("height", "3000px");
                }
            }
        }
    }

    public onToggleFullScreen(oEvent: Event): void {
        const oButton = oEvent.getSource() as Button;
        const oLeftPaneLayout = this.byId("leftPaneLayout") as SplitterLayoutData;
        const bIsFullScreen = oButton.getIcon() === "sap-icon://exit-full-screen";

        if (bIsFullScreen) {
            oLeftPaneLayout.setSize("400px");
            oButton.setIcon("sap-icon://full-screen");
        } else {
            oLeftPaneLayout.setSize("0px");
            oButton.setIcon("sap-icon://exit-full-screen");
        }
    }

    public onCopySyntax(): void {
        const sPayload: string = (this.getView()?.getModel("diagramData") as JSONModel).getProperty("/payload");
        if (navigator && navigator.clipboard) {
            navigator.clipboard.writeText(sPayload).then(() => MessageToast.show("Copied Source!"));
        }
    }

    public onDownloadSource(): void {
        const oData = (this.getView()?.getModel("diagramData") as JSONModel).getData();
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
    /* 6. HISTORY & VARIANT MANAGEMENT SYSTEM                      */
    /* =========================================================== */

    private _loadHistory(): void {
        const sHistory = localStorage.getItem("vdmSearchHistory");
        this.getView()?.setModel(new JSONModel({ items: sHistory ? JSON.parse(sHistory) : [] }), "history");
    }

    private _updateHistory(sName: string): void {
        let aHistory: any[] = (this.getView()?.getModel("history") as JSONModel).getProperty("/items");
        aHistory = aHistory.filter((item: any) => item.name !== sName);
        aHistory.unshift({ name: sName });
        if (aHistory.length > 10) aHistory.pop();
        localStorage.setItem("vdmSearchHistory", JSON.stringify(aHistory));
        (this.getView()?.getModel("history") as JSONModel).setProperty("/items", aHistory);
    }

    private _loadVariants(): void {
        const sVariants = localStorage.getItem("vdmVariants");
        const aVariants = sVariants ? JSON.parse(sVariants) : [];
        this.getView()?.setModel(new JSONModel({ items: aVariants }), "variants");
    }

    /**
     * Initiates the Variant Save workflow. Opens a dialog to name the configuration.
     */
    public onSaveVariant(): void {
        const sCurrentVariant = (this.byId("selVariant") as Select).getSelectedKey() || "";
        const oInput = new Input({ value: sCurrentVariant, placeholder: "e.g., Default BP View" });

        const oDialog = new Dialog({
            title: "Save Variant",
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
     * Evaluates the requested variant name. Prompts for overwrite if it exists, otherwise saves.
     */
    private _handleSaveVariantDialogConfirm(sName: string, oDialog: Dialog): void {
        if (!sName) {
            MessageToast.show("Please enter a name.");
            return;
        }

        const oModel = this.getView()?.getModel("variants") as JSONModel;
        const aVariants: any[] = oModel.getProperty("/items");
        const bExists = aVariants.some(v => v.name === sName);

        if (bExists) {
            MessageBox.confirm(
                `A variant named '${sName}' already exists. Overwrite?`,
                {
                    title: "Overwrite Variant?",
                    actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                    onClose: (sAction: string) => {
                        if (sAction === MessageBox.Action.YES) {
                            this._executeVariantSave(sName, oModel, aVariants);
                            oDialog.close();
                        }
                    }
                }
            );
        } else {
            this._executeVariantSave(sName, oModel, aVariants);
            oDialog.close();
        }
    }

    /**
     * Executes the actual save to localStorage by gathering the current UI state.
     */
    private _executeVariantSave(sName: string, oModel: JSONModel, aVariants: any[]): void {
        const oState = this._captureCurrentUiState(sName);

        // Remove existing item if overwriting, then push new state
        aVariants = aVariants.filter(v => v.name !== sName);
        aVariants.push(oState);

        localStorage.setItem("vdmVariants", JSON.stringify(aVariants));
        oModel.setProperty("/items", aVariants);
        (this.byId("selVariant") as Select).setSelectedKey(sName);

        MessageToast.show(`Variant '${sName}' saved.`);
    }

    /**
     * Reads all left-pane inputs and switches into a standardized object.
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
     * Removes the currently selected variant from local storage.
     */
    public onDeleteVariant(): void {
        const sSelectedName = (this.byId("selVariant") as Select).getSelectedKey();
        if (!sSelectedName) {
            MessageToast.show("No variant selected to delete.");
            return;
        }

        const oModel = this.getView()?.getModel("variants") as JSONModel;
        let aVariants: any[] = oModel.getProperty("/items");

        aVariants = aVariants.filter(v => v.name !== sSelectedName);
        localStorage.setItem("vdmVariants", JSON.stringify(aVariants));
        oModel.setProperty("/items", aVariants);

        MessageToast.show(`Variant '${sSelectedName}' deleted.`);
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
            
            // Manually trigger the view toggle
            if (sMode === "LINES") {
                (this.byId("boxLines") as VBox).setVisible(true);
                (this.byId("boxDiscovery") as VBox).setVisible(false);
            } else {
                (this.byId("boxLines") as VBox).setVisible(false);
                (this.byId("boxDiscovery") as VBox).setVisible(true);
            }

            // Default to true for backward compatibility on older variants
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

            MessageToast.show(`Variant '${oVariant.name}' applied.`);
        }
    }

    /* =========================================================== */
    /* 7. UTILITIES (SCRIPT LOADER & BASE64 COMPRESSION)           */
    /* =========================================================== */

    /**
     * Dynamically injects external scripts (D3, Mermaid, Pako) via CDN.
     * Uses a Promise cache to prevent loading the same script twice.
     */
    private _loadScript(src: string): Promise<void> {
        if (this._scriptPromises[src]) return this._scriptPromises[src]!;
        const newPromise = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => { delete this._scriptPromises[src]; reject(new Error(`Failed: ${src}`)); };
            document.head.appendChild(script);
        });
        this._scriptPromises[src] = newPromise;
        return newPromise;
    }

    /**
     * Maps standard Base64 to PlantUML's proprietary custom 6-bit URL-safe alphabet.
     */
    private _encode64(data: Uint8Array): string {
        let r = "";
        for (let i = 0; i < data.length; i += 3) {
            if (i + 2 === data.length) r += this._enc3(data[i], data[i + 1], 0);
            else if (i + 1 === data.length) r += this._enc3(data[i], 0, 0);
            else r += this._enc3(data[i], data[i + 1], data[i + 2]);
        }
        return r;
    }

    private _enc3(b1: number, b2: number, b3: number): string {
        const c1 = b1 >> 2;
        const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
        const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
        const c4 = b3 & 0x3F;
        return this._enc1(c1 & 0x3F) + this._enc1(c2 & 0x3F) + this._enc1(c3 & 0x3F) + this._enc1(c4 & 0x3F);
    }

    private _enc1(b: number): string {
        if (b < 10) return String.fromCharCode(48 + b); b -= 10;
        if (b < 26) return String.fromCharCode(65 + b); b -= 26;
        if (b < 26) return String.fromCharCode(97 + b); b -= 26;
        if (b === 0) return '-'; if (b === 1) return '_'; return '?';
    }
}