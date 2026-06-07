/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.helpers
 * @fileoverview Single Responsibility module for View Model Bootstrapping.
 * @description Extracts large JSONModel instantiation out of the Diagram Controller to prevent God Class bloating.
 */

import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import { ModelNames } from "../constants/StateConstants";

export default class DiagramModelInit {
    
    /**
     * @public
     * @static
     * @description Injects the baseline UI and Data models into the active View.
     * @param {View} activeView - The Fiori View requiring bootstrapping.
     */
    public static bootstrapModels(activeView: View): void {
        // Local UI state model (controls Toolbar visibility and icons)
        activeView.setModel(new JSONModel({ 
            hasDiagram: false, 
            hasError: false, 
            errorText: "", 
            canExportImg: false,
            canExportSource: false,
            showMinimap: false,
            canShowMinimap: false,
            canSearch: false,
            fullScreenIcon: "sap-icon://full-screen", // Default icon state
            isFullScreen: false,
            hasHiddenNodes: false,
            isSelectMode: true,
            isFocusMode: false,
            focusNodeName: "",
            hasNodeSelected: false,
            tempFocusMode: false
        }), ModelNames.VIEW);
        
        // Data model storage required for ExportHandler operations
        activeView.setModel(new JSONModel({ 
            payload: "", 
            extension: "", 
            cdsName: "", 
            engine: "",
            rootCdsName: "",
            breadcrumbLinks: [],
            currentBreadcrumb: ""
        }), ModelNames.DIAGRAM_DATA);
    }
}
