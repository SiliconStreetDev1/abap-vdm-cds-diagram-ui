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
        oUiModel.setProperty("/fclLayout", "TwoColumnsMidExpanded"); 
        
        oView.setModel(oUiModel, "ui");
    }
}