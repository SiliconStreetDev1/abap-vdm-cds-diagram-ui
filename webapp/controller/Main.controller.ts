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

export default class Main extends Controller {
    
    /**
     * @public
     * @description Lifecycle hook. Injects the global UI state model.
     * @returns {void}
     */
    public onInit(): void {
        const oView = this.getView();
        if (!oView) return;

        // Initialize the base UI state from your helper
        const oUiModel = ViewStateHelper.initializeUiModel();
        
        // Add the FCL layout property to control pane widths dynamically
        oUiModel.setProperty(UiState.FCL_LAYOUT, "TwoColumnsMidExpanded"); 
        oUiModel.setProperty(UiState.IS_VIEWER_MODE, false);

        const component = this.getOwnerComponent() as UIComponent;
        if (component) {
            // ENTERPRISE FIX: Hoist the UI model to the Component level so RouteManager can access it safely
            component.setModel(oUiModel, ModelNames.UI);
            new RouteManager(component).attachRoutes();
        } else {
            oView.setModel(oUiModel, ModelNames.UI);
        }
    }
}