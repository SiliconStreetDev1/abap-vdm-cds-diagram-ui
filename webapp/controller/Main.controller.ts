/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Main structural controller for the VDM Diagrammer.
 * @version 2.0
 * @description Acts as the root orchestrator. Its sole responsibility is to 
 * initialize the global UI state model that drives the Flexible Column Layout.
 */

import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import ViewStateHelper from "../helpers/ViewStateHelper";
import RouteManager from "../services/RouteManager";
import UIComponent from "sap/ui/core/UIComponent";
import { UiState, ModelNames } from "../constants/StateConstants";
import SoundscapeManager from "../services/SoundscapeManager";

export default class Main extends Controller {
    
    private _routeManager?: RouteManager;
    
    /**
     * @public
     * @description Lifecycle hook. Injects the global UI state model.
     * @returns {void}
     */
    public onInit(): void {
        const activeView = this.getView();
        if (!activeView) return;

        // Initialize the base UI state from your helper
        const oUiModel = ViewStateHelper.initializeUiModel();
        
        // Add the FCL layout property to control pane widths dynamically
        oUiModel.setProperty(UiState.FCL_LAYOUT, "TwoColumnsMidExpanded"); 
        oUiModel.setProperty(UiState.IS_VIEWER_MODE, false);

        const component = this.getOwnerComponent() as UIComponent;
        if (component) {
            // ENTERPRISE FIX: Hoist the UI model to the Component level so RouteManager can access it safely
            component.setModel(oUiModel, ModelNames.UI);

            // Load the Animations JSON Dictionary into global memory
            const oAnimModel = new JSONModel();
            oAnimModel.loadData(sap.ui.require.toUrl("nz/co/siliconstreet/vdmdiagrammer/animations.json"));
            component.setModel(oAnimModel, "animations");

            // Load the Messages JSON Dictionary into global memory
            const oMsgModel = new JSONModel();
            oMsgModel.loadData(sap.ui.require.toUrl("nz/co/siliconstreet/vdmdiagrammer/messages.json"));
            component.setModel(oMsgModel, "messages");

            // Initialize decoupled audio observer
            SoundscapeManager.attachEvents();

            this._routeManager = new RouteManager(component);
            this._routeManager.attachRoutes();
        } else {
            activeView.setModel(oUiModel, ModelNames.UI);
        }
    }

    /**
     * @public
     * @description Lifecycle teardown. Severs global event listeners to prevent Ghost Events.
     */
    public onExit(): void {
        SoundscapeManager.detachEvents();
        if (this._routeManager) this._routeManager.detachRoutes();
    }
}