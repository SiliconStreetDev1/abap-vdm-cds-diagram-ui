/**
 * @fileoverview Deep Link and Routing Orchestrator.
 * @description Intercepts specific URL routes (e.g., Viewer Mode) to bypass standard 
 * UI initialization, forcefully lockdown the FCL layout, and execute read-only presentations.
 */
import UIComponent from "sap/ui/core/UIComponent";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import VariantService from "./VariantService";
import DiagramService, { IDiagramRequest } from "./DiagramService";
import Renderer from "../renderer/Renderer";
import { EventManager } from "../events/EventManager";
import { UiState, ModelNames } from "../constants/StateConstants";
import { IRenderRequestPayload } from "../types";
import ViewStateHelper from "../helpers/ViewStateHelper";

export default class RouteManager {
    private component: UIComponent;
    private hashChangeBind!: EventListener;
    private _modelContextChangeBind!: () => void;

    constructor(component: UIComponent) {
        this.component = component;
    }

    /**
     * @public
     * @description Hooks into the UI5 Hash/Router. Includes a standalone fallback 
     * interceptor for environments missing strict manifest.json route declarations.
     */
    public attachRoutes(): void {
        const router = this.component.getRouter();
        if (router) {
            const viewerRoute = router.getRoute("viewer");
            if (viewerRoute) viewerRoute.attachPatternMatched(this.onViewerRouteMatched, this);
        }

        this.checkHashFallback();
        this.hashChangeBind = this.checkHashFallback.bind(this) as EventListener;
        window.addEventListener("hashchange", this.hashChangeBind);
    }

    /**
     * @public
     * @description Executes detachRoutes functionality.
     */
    public detachRoutes(): void {
        const router = this.component.getRouter();
        if (router) {
            const viewerRoute = router.getRoute("viewer");
            if (viewerRoute) viewerRoute.detachPatternMatched(this.onViewerRouteMatched, this);
        }
        if (this.hashChangeBind) window.removeEventListener("hashchange", this.hashChangeBind);
        if (this._modelContextChangeBind) this.component.detachEvent("modelContextChange", this._modelContextChangeBind);
    }

    /**
     * @private
     * @description Manual fallback to check the hash for deep links if UI5 routing is not fully initialized.
     */
    private checkHashFallback(): void {
        const hash = window.location.hash;
        const match = hash.match(/\/viewer\/([a-zA-Z0-9-]+)/);
        if (match && match[1]) this.executeViewerMode(match[1]);
    }

    /**
     * @private
     * @description Event handler for when the "viewer" route pattern is matched.
     * @param {any} event - UI5 route matched event.
     */
    private onViewerRouteMatched(event: any): void {
        const args = event.getParameter("arguments");
        if (args && args.variantId) this.executeViewerMode(args.variantId);
    }

    /**
     * @private
     * @description Orchestrates the lockdown and initialization of the UI for Viewer Mode.
     * @param {string} variantId - The UUID of the variant to load.
     * @returns {Promise<void>}
     */
    private async executeViewerMode(variantId: string): Promise<void> {
        const uiModel = this.component.getModel(ModelNames.UI) as JSONModel;
        const odataModel = this.component.getModel() as ODataModel;

        if (!uiModel || !odataModel) {
            // ENTERPRISE FIX: Eradicate arbitrary setTimeout hacks.
            // Listen natively to the UI5 lifecycle event for deferred model resolution.
            this._modelContextChangeBind = () => this.executeViewerMode(variantId);
            this.component.attachEventOnce("modelContextChange", this._modelContextChangeBind);
            return;
        }

        // 1. Force Fullscreen FCL Layout IMMEDIATELY to prevent Cytoscape from reading mid-animation DOM sizes
        uiModel.setProperty(UiState.FCL_LAYOUT, "MidColumnFullScreen");
        uiModel.setProperty(UiState.IS_VIEWER_MODE, true);

        // ENTERPRISE FIX: Ensure cosmetic JSON dictionaries are fully loaded into memory
        // before spawning the busy dialog, otherwise it falls back to the default icon and text.
        const animModel = this.component.getModel("animations") as JSONModel;
        const msgModel = this.component.getModel("messages") as JSONModel;

        const waitForModel = (model: JSONModel) => new Promise<void>(resolve => {
            if (!model || (model.getData() && Object.keys(model.getData()).length > 0)) {
                resolve();
            } else {
                model.attachEventOnce("requestCompleted", () => resolve());
                model.attachEventOnce("requestFailed", () => resolve());
            }
        });

        await Promise.all([waitForModel(animModel), waitForModel(msgModel)]);

        // ENTERPRISE UX: Immediately lock the UI and suppress the "No Diagram" empty state
        // before evaluating deferred models to guarantee zero UI flashing.
        ViewStateHelper.setAppBusy(true, this.component, true);
        EventManager.getInstance().publish("diagram:viewerLoading", undefined, true);

        try {
            // 2. Fetch the specific UUID payload (bypassing dropdown filters)
            const variantState = await VariantService.getVariantById(odataModel, variantId);
            uiModel.setProperty("/loadedVariantState", variantState);

            // 3. Map Variant settings directly to the Backend DTO (Bypassing the hidden UI DOM)
            const engine = variantState.engine as string || Renderer.getDefaultEngine();
            const request: IDiagramRequest = {
                cdsName: variantState.cdsName || "", engine: engine, maxLevel: variantState.maxLevel || 1,
                showKeys: !!variantState.keys, showFields: !!variantState.fields, showAssocFields: !!variantState.assocFields,
                showBase: !!variantState.base, customOnly: !!variantState.customOnly, lineAssoc: !!variantState.lineAssoc,
                lineComp: !!variantState.lineComp, lineInherit: !!variantState.lineInherit, discAssoc: !!variantState.discAssoc,
                discComp: !!variantState.discComp, discInherit: !!variantState.discInherit, includeCds: variantState.includeCds || "",
                excludeCds: variantState.excludeCds || "", formatConfigJson: ""
            };

            const formatKey = Object.keys(variantState).find(key => key.toUpperCase() === `FORMAT${engine}`);
            const engineConfig = formatKey ? Object.assign({}, (variantState as any)[formatKey]) : {};
            request.formatConfigJson = JSON.stringify(Renderer.formatBackendConfig(engine, engineConfig));

            // 4. Execute raw OData fetch to build the dynamic hierarchy
            const result = await DiagramService.fetchDiagram(odataModel, request);

            // 5. Construct Diagram Payload with STRICT VIEWER LOCKDOWN rules
            engineConfig.presetPositions = variantState.canvasState;
            if (variantState.canvasState) engineConfig.layout_algorithm = "preset";
            engineConfig.isViewerMode = true;

            const payload: IRenderRequestPayload = {
                payload: result.DiagramPayload, extension: result.FileExtension, cdsName: result.CdsName,
                engine: engine as any, rootCdsName: result.CdsName, breadcrumbs: [result.CdsName], engineConfig: engineConfig
            };

            EventManager.getInstance().publish("diagram:renderRequest", payload, true);

        } catch (error: any) {
            MessageToast.show(error.message || "Failed to load shared diagram. It may have been deleted or access was revoked.");
        } finally {
            ViewStateHelper.setAppBusy(false, this.component);
        }
    }
}