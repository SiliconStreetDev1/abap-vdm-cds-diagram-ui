/**
 * @fileoverview Utility class for building OData V4 Filters from UI State.
 * @version 1.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 */
import View from "sap/ui/core/mvc/View";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import SegmentedButton from "sap/m/SegmentedButton";
import Switch from "sap/m/Switch";
import MultiInput from "sap/m/MultiInput";
import StepInput from "sap/m/StepInput";
import JSONModel from "sap/ui/model/json/JSONModel";

export default class FilterBuilder {
    
    /**
     * Maps all UI inputs into OData Filter objects.
     * Extracts dynamic JSON formatting specific to the current engine and translates
     * UI-specific Dropdowns (like lineStyle) back into ABAP-friendly boolean structures.
     * @param {View} oView - The current SAPUI5 View.
     * @param {string} sCdsName - Targeted CDS view.
     * @param {string} sEngine - Selected renderer engine.
     * @returns {Filter[]} Array of filters for the bindList call.
     * @public
     */
    public static buildFiltersFromView(oView: View, sCdsName: string, sEngine: string): Filter[] {
        const sRelMode = (oView.byId("segRelMode") as SegmentedButton).getSelectedKey();
        const bIsLinesMode = (sRelMode === "LINES");

        const aFilters = [
            new Filter("CdsName", FilterOperator.EQ, sCdsName),
            new Filter("RendererEngine", FilterOperator.EQ, sEngine),
            new Filter("MaxLevel", FilterOperator.EQ, (oView.byId("stepMaxLevel") as StepInput).getValue()),
            new Filter("ShowKeys", FilterOperator.EQ, (oView.byId("swKeys") as Switch).getState()),
            new Filter("ShowFields", FilterOperator.EQ, (oView.byId("swFields") as Switch).getState()),
            new Filter("ShowAssocFields", FilterOperator.EQ, (oView.byId("swAssocFields") as Switch).getState()),
            new Filter("ShowBase", FilterOperator.EQ, (oView.byId("swBase") as Switch).getState()),
            new Filter("CustomDevOnly", FilterOperator.EQ, (oView.byId("swCustomOnly") as Switch).getState()),
            
            // LOGIC: Mutually exclusive parameters based on Relationship Mode
            new Filter("LineAssoc", FilterOperator.EQ, bIsLinesMode ? (oView.byId("swLineAssoc") as Switch).getState() : false),
            new Filter("LineComp", FilterOperator.EQ, bIsLinesMode ? (oView.byId("swLineComp") as Switch).getState() : false),
            new Filter("LineInherit", FilterOperator.EQ, bIsLinesMode ? (oView.byId("swLineInherit") as Switch).getState() : false),

            new Filter("DiscAssoc", FilterOperator.EQ, !bIsLinesMode ? (oView.byId("swDiscAssoc") as Switch).getState() : false),
            new Filter("DiscComp", FilterOperator.EQ, !bIsLinesMode ? (oView.byId("swDiscComp") as Switch).getState() : false),
            new Filter("DiscInherit", FilterOperator.EQ, !bIsLinesMode ? (oView.byId("swDiscInherit") as Switch).getState() : false)
        ];

        // Process Tokens from MultiInputs into comma-separated strings for ABAP parsing
        const aIncTokens = (oView.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (oView.byId("inpExclude") as MultiInput).getTokens();
        const sInclude = aIncTokens.map(t => t.getText()).join(",");
        const sExclude = aExcTokens.map(t => t.getText()).join(",");

        if (sInclude) aFilters.push(new Filter("IncludeCds", FilterOperator.EQ, sInclude));
        if (sExclude) aFilters.push(new Filter("ExcludeCds", FilterOperator.EQ, sExclude));

        // -------------------------------------------------------------------------
        // DYNAMIC JSON PAYLOAD CONSTRUCTION & TRANSLATION
        // -------------------------------------------------------------------------
        const oUiModel = oView.getModel("ui") as JSONModel;
        let oFormatConfig: any = {};

        // Deep copy properties so we don't accidentally mutate the live UI model during translation
        if (sEngine === "PLANTUML") {
            oFormatConfig = Object.assign({}, oUiModel.getProperty("/formatPlantUML"));
            oFormatConfig.ortho = (oFormatConfig.lineStyle === "ortho");
            oFormatConfig.polyline = (oFormatConfig.lineStyle === "polyline");
            delete oFormatConfig.lineStyle; 
        } else if (sEngine === "GRAPHVIZ") {
            oFormatConfig = Object.assign({}, oUiModel.getProperty("/formatGraphviz"));
            oFormatConfig.ortho = (oFormatConfig.lineStyle === "ortho");
            oFormatConfig.polyline = (oFormatConfig.lineStyle === "polyline");
            delete oFormatConfig.lineStyle; 
        } else if (sEngine === "MERMAID") {
            oFormatConfig = Object.assign({}, oUiModel.getProperty("/formatMermaid"));
        }
        
        // Serialize and push the JSON string as an OData filter for the ABAP backend
        const sFormatJson = JSON.stringify(oFormatConfig);
        aFilters.push(new Filter("FormatConfig", FilterOperator.EQ, sFormatJson));

        return aFilters;
    }
}