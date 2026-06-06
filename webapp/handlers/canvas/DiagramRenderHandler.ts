/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates Diagram rendering lifecycle and View Model updates.
 * @description Relieves the main controller of massive payload parsing and state management tasks.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import HTML from "sap/ui/core/HTML";
import { EventManager } from "../../events/EventManager";
import { Subscription } from "../../events/Subscription";
import Renderer from "../../renderer/Renderer";
import { EngineType, IRenderRequestPayload } from "../../types";
import { UiState, ViewState } from "../../constants/StateConstants";

/**
 * @class DiagramRenderHandler
 * @description Encapsulates Diagram rendering lifecycle and View Model updates. 
 * Relieves the main controller of massive payload parsing and state management tasks.
 */
export default class DiagramRenderHandler {
    private _oView: View;
    private _subscriptions: Subscription[] = [];
    private _fnGetText: (k: string, args?: any[]) => string;
    private _fnCanvasReadyBind!: any;
    private _bIsAttached: boolean = false;

    /**
     * @constructor
     * @param {View} oView - Reference to the active UI5 view.
     * @param {Function} fnGetText - Delegate function for i18n translations.
     */
    constructor(oView: View, fnGetText: (k: string, args?: any[]) => string) {
        this._oView = oView;
        this._fnGetText = fnGetText;
    }

    /**
     * @public
     * @description Subscribes to rendering-specific event channels.
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;
        this._subscriptions.push(EventManager.getInstance().subscribe("diagram:renderRequest", this._onRenderRequest.bind(this)));
        this._subscriptions.push(EventManager.getInstance().subscribe("diagram:renderFailed", this._onRenderFailed.bind(this)));
        this._subscriptions.push(EventManager.getInstance().subscribe("diagram:liveFormatUpdate", this._onLiveFormatUpdate.bind(this)));
        this._subscriptions.push(EventManager.getInstance().subscribe("diagram:viewerLoading", this._onViewerLoading.bind(this)));
        this._fnCanvasReadyBind = this._onCanvasReady.bind(this) as any;
        if (typeof document !== "undefined") {
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:ready", this._fnCanvasReadyBind));
        }
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches all local subscribers.
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;
        this._subscriptions.forEach(sub => sub.dispose());
        this._subscriptions = [];
        if (typeof document !== "undefined") {
            /* removed */
        }
        this._bIsAttached = false;
    }

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    /**
     * @private
     * @description Handles real-time format configuration pushes.
     * @param {any} oData - The format configuration object.
     */
    private _onLiveFormatUpdate(oData: any): void {
        this.handleLiveFormatUpdate(oData);
    }

    /**
     * @private
     * @description Bubbles up rendering exceptions to the user.
     * @param {any} oData - Error object.
     */
    private _onRenderFailed(oData: any): void {
        this.showError(oData.message || "Rendering failed.");
    }

    /**
     * @private
     * @description Indicates the generic viewer is initializing.
     */
    private _onViewerLoading(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty(ViewState.HAS_DIAGRAM, true);
            oViewModel.setProperty(ViewState.HAS_ERROR, false);
        }
    }

    /**
     * @private
     * @description Top-level request handler interceptor. Dispatches the render request.
     * @param {any} oEventData - Diagram execution payload.
     */
    private _onRenderRequest(oEventData: any): void {
        // ENTERPRISE UX: Auto-pause the video loop during a Drill-Down network request
        EventManager.getInstance().publish("video:autoPause", undefined);

        const oHtml = this._oView.byId("htmlRenderer") as HTML;
        this.handleRenderRequest(oEventData as IRenderRequestPayload, oHtml);

        // Synchronous engines do not run asynchronous physics layouts or emit CANVAS_READY.
        // We safely resume the recording after a short deferral to allow the DOM to paint.
        if (!Renderer.isAsynchronousRenderer(oEventData.engine)) {
            setTimeout(() => {
                EventManager.getInstance().publish("video:autoResume", undefined);
            }, 500);
        }
    }

    /**
     * @private
     * @description Resolves completion of internal engine Physics ticks or rendering sequences.
     * @param {globalThis.Event} oEvent - Custom Event Manager payload.
     */
    private _onCanvasReady(oEvent: globalThis.Event): void {
        const payload = oEvent as any;
        if (payload?.viewId && payload.viewId !== this._getInstanceId()) return;
        
        // Seamlessly auto-resume the video feed directly on the new diagram!
        EventManager.getInstance().publish("video:autoResume", undefined);
    }

    /**
     * @public
     * @description Immediately propagates format configurations to the active Renderer.
     * @param {any} oData - Configuration bundle payload.
     */
    public handleLiveFormatUpdate(oData: any): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty(ViewState.HAS_DIAGRAM)) {
            try {
                Renderer.updateLiveFormat(this._getInstanceId(), oData.engine, oData.format);
            } catch (oError: any) {
                this.showError(oError.message);
            }
        }
    }

    /**
     * @public
     * @description Main entry point for bootstrapping a UI update using a fresh backend graph payload.
     * Parses payload configuration metadata into the `diagramData` model before routing it to WASM/JS adapters.
     * @param {IRenderRequestPayload} oData - Complex object with graph topologies.
     * @param {HTML} oHtmlControl - Physical HTML surface that will host the visual map.
     */
    public handleRenderRequest(oData: IRenderRequestPayload, oHtmlControl: HTML): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const oDataModel = this._oView.getModel("diagramData") as JSONModel;

        if (!oViewModel || !oDataModel) return;

        const bSupportsMinimap = Renderer.supportsMinimap(oData.engine);
        if (!bSupportsMinimap) {
            oViewModel.setProperty(ViewState.SHOW_MINIMAP, false);
            Renderer.toggleMinimap(this._getInstanceId(), oData.engine, false);
        }
        oViewModel.setProperty(ViewState.CAN_SHOW_MINIMAP, bSupportsMinimap);
        oViewModel.setProperty(ViewState.CAN_SEARCH, Renderer.supportsSearch(oData.engine));

        this.resetState();

        // 1. Persist the payload for export operations
        oDataModel.setData({
            payload: oData.payload,
            extension: oData.extension,
            cdsName: oData.cdsName,
            engine: oData.engine,
            rootCdsName: oData.rootCdsName,
            breadcrumbLinks: (oData.breadcrumbs || []).slice(0, -1).map((name: string) => ({ name })),
            currentBreadcrumb: (oData.breadcrumbs || [])[(oData.breadcrumbs || []).length - 1] || "",
            engineConfig: oData.engineConfig
        });

        // 2. Extract specific export capabilities from the active Engine architecture
        oViewModel.setProperty(ViewState.CAN_EXPORT_IMG, Renderer.supportsImageExport(oData.engine));
        oViewModel.setProperty(ViewState.CAN_EXPORT_SOURCE, Renderer.supportsSourceExport(oData.engine));

        // 3. Prepare the general canvas UI state 
        oViewModel.setProperty(ViewState.HAS_DIAGRAM, true);
        
        const bIsDrillDown = !!(oData.rootCdsName && oData.cdsName !== oData.rootCdsName);
        oViewModel.setProperty(ViewState.IS_SELECT_MODE, false); // Re-enforce default tool on new renders

        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) {
            oUiModel.setProperty(UiState.IS_DRILL_DOWN, bIsDrillDown);
            
            if (Renderer.supportsStateCapture(oData.engine)) {
                const oModelData = oUiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${oData.engine}`);
                if (sFormatKey) {
                    if (oData.engineConfig?.presetPositions && (!bIsDrillDown || oData.engineConfig.isRestore)) {
                        oUiModel.setProperty(`/${sFormatKey}/layout_algorithm`, "preset");
                    } else if (bIsDrillDown && !oData.engineConfig?.isRestore && oUiModel.getProperty(`/${sFormatKey}/layout_algorithm`) === "preset") {
                        oUiModel.setProperty(`/${sFormatKey}/layout_algorithm`, "dagre");
                    }
                }
            }
        }
        
        if (oData.engineConfig) {
            oData.engineConfig.isDrillDown = bIsDrillDown;
        }

        // 4. Trigger the WASM/JS rendering engine
        try {
            Renderer.renderDiagram(this._getInstanceId(), oData.engine, oData.payload, oHtmlControl, (sMsg: string) => this.showError(sMsg), oData.engineConfig)
                .catch((oError: any) => this.showError(oError.message || "Asynchronous rendering failure."));
        } catch (oError: any) {
            this.showError(oError.message);
        }
    }

    /**
     * @public
     * @description Helper to set generic UI into an exception state.
     * @param {string} sMessage - Exception descriptor to present to the user.
     */
    public showError(sMessage: string): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty(ViewState.HAS_ERROR, true);
            oViewModel.setProperty(ViewState.ERROR_TEXT, this._fnGetText(sMessage) || sMessage);
        }
    }

    /**
     * @public
     * @description Cleans all contextual diagram variables back to their initial unrendered status.
     */
    public resetState(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty(ViewState.HAS_ERROR, false);
            oViewModel.setProperty(ViewState.HAS_DIAGRAM, false);
            oViewModel.setProperty(ViewState.IS_FOCUS_MODE, false);
            oViewModel.setProperty(ViewState.FOCUS_NODE_NAME, "");
            oViewModel.setProperty(ViewState.HAS_NODE_SELECTED, false);
            oViewModel.setProperty(ViewState.TEMP_FOCUS_MODE, false);
        }
    }
}