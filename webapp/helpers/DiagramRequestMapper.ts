/**
 * @fileoverview Utility class for mapping UI State to the Diagram Request DTO.
 * @version 1.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 */
import View from "sap/ui/core/mvc/View";
import SegmentedButton from "sap/m/SegmentedButton";
import Switch from "sap/m/Switch";
import MultiInput from "sap/m/MultiInput";
import StepInput from "sap/m/StepInput";
import JSONModel from "sap/ui/model/json/JSONModel";
import Renderer from "../renderer/Renderer";
import { EngineType } from "../types";
import { IDiagramRequest } from "../services/DiagramService";

export default class DiagramRequestMapper {
    
    /**
     * @public
     * @static
     * @description Maps all UI inputs into a pure Data Transfer Object (DTO).
     * Extracts dynamic JSON formatting specific to the current engine.
     * @param {View} oView - The current SAPUI5 View.
     * @param {string} sCdsName - Targeted CDS view.
     * @param {EngineType} sEngine - Selected renderer engine.
     * @returns {IDiagramRequest} The populated DTO for the DiagramService.
     */
    public static buildRequest(oView: View, sCdsName: string, sEngine: EngineType): IDiagramRequest {
        const oUiModel = oView.getModel("ui") as JSONModel;
        const reqConfig = oUiModel.getProperty("/diagramRequest") || {};
        const bIsLinesMode = (reqConfig.relMode === "LINES");

        const aIncTokens = (oView.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (oView.byId("inpExclude") as MultiInput).getTokens();
        
        // Dynamically resolve the UI model path using reflection to avoid hardcoded switch maps
        const oModelData = oUiModel.getData();
        const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
        const oRawConfig = sFormatKey ? oUiModel.getProperty(`/${sFormatKey}`) : {};
        
        // Delegate extraction and formatting directly to the specific engine
        const oFormatConfig = Renderer.formatBackendConfig(sEngine, oRawConfig || {});

        return {
            cdsName: sCdsName,
            engine: sEngine,
            maxLevel: (oView.byId("stepMaxLevel") as StepInput).getValue(),
            showKeys: reqConfig.showKeys,
            showFields: reqConfig.showFields,
            showAssocFields: reqConfig.showAssocFields,
            showBase: reqConfig.showBase,
            customOnly: reqConfig.customOnly,
            
            lineAssoc: bIsLinesMode ? reqConfig.lineAssoc : false,
            lineComp: bIsLinesMode ? reqConfig.lineComp : false,
            lineInherit: bIsLinesMode ? reqConfig.lineInherit : false,
            
            discAssoc: !bIsLinesMode ? reqConfig.discAssoc : false,
            discComp: !bIsLinesMode ? reqConfig.discComp : false,
            discInherit: !bIsLinesMode ? reqConfig.discInherit : false,
            
            includeCds: aIncTokens.map(t => t.getText()).join(","),
            excludeCds: aExcTokens.map(t => t.getText()).join(","),
            
            formatConfigJson: JSON.stringify(oFormatConfig)
        };
    }
}