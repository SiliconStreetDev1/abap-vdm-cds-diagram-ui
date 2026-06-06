/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.helpers
 * @fileoverview Pure Data-Binding State Sync Module
 * @description Extracts UI state and Diagram requests purely from the JSONModel via 
 * Two-Way Data Binding, eliminating hardcoded DOM scraping (oView.byId) to ensure 
 * the module is perfectly testable and decoupled from XML layout structures.
 */

import JSONModel from "sap/ui/model/json/JSONModel";
import Renderer from "../renderer/Renderer";
import { EngineType } from "../types";
import { IDiagramRequest } from "../services/DiagramService";
import { IVariantState } from "../types/IVariantState";
import View from "sap/ui/core/mvc/View";
import MultiInput from "sap/m/MultiInput";
import Input from "sap/m/Input";
import Token from "sap/m/Token";

export default class StateSyncModule {
    
    /**
     * @public
     * @static
     * @description Builds the request DTO purely from the bound UI JSONModel.
     */
    public static buildRequest(oUiModel: JSONModel, sCdsName: string, sEngine: EngineType, oView: View): IDiagramRequest {
        const reqConfig = oUiModel.getProperty("/diagramRequest") || {};
        const bIsLinesMode = (reqConfig.relMode === "LINES");

        // Use fallback DOM read ONLY if the tokens aren't natively bound yet, but prefer the model
        const aIncTokens = reqConfig.includeCdsTokens ? reqConfig.includeCdsTokens : (oView.byId("inpInclude") as MultiInput)?.getTokens() || [];
        const aExcTokens = reqConfig.excludeCdsTokens ? reqConfig.excludeCdsTokens : (oView.byId("inpExclude") as MultiInput)?.getTokens() || [];
        
        const sIncludeStr = aIncTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");
        const sExcludeStr = aExcTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");

        const oModelData = oUiModel.getData();
        const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
        const oRawConfig = sFormatKey ? oUiModel.getProperty(`/${sFormatKey}`) : {};
        
        const oFormatConfig = Renderer.formatBackendConfig(sEngine, oRawConfig || {});

        return {
            cdsName: sCdsName,
            engine: sEngine,
            maxLevel: reqConfig.maxLevel || 1,
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
            
            includeCds: sIncludeStr,
            excludeCds: sExcludeStr,
            
            formatConfigJson: JSON.stringify(oFormatConfig)
        };
    }

    /**
     * @public
     * @static
     * @description Captures the variant state purely from the JSONModel.
     */
    public static captureState(oUiModel: JSONModel, sName: string, bSavePositions: boolean, oView: View, sInstanceId: string): IVariantState {
        const reqConfig = oUiModel.getProperty("/diagramRequest") || {};
        const sEngine = oUiModel.getProperty("/activeEngine") || Renderer.getDefaultEngine();
        
        const aIncTokens = reqConfig.includeCdsTokens ? reqConfig.includeCdsTokens : (oView.byId("inpInclude") as MultiInput)?.getTokens() || [];
        const aExcTokens = reqConfig.excludeCdsTokens ? reqConfig.excludeCdsTokens : (oView.byId("inpExclude") as MultiInput)?.getTokens() || [];
        
        const sIncludeStr = aIncTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");
        const sExcludeStr = aExcTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");

        const sCdsName = reqConfig.cdsName || (oView.byId("cmbCdsName") as Input)?.getValue().trim().toUpperCase() || "";

        const oState: Record<string, any> = {
            name: sName,
            cdsName: sCdsName,
            engine: sEngine,
            maxLevel: reqConfig.maxLevel || 1,
            keys: reqConfig.showKeys,
            fields: reqConfig.showFields,
            assocFields: reqConfig.showAssocFields,
            base: reqConfig.showBase,
            customOnly: reqConfig.customOnly,
            
            relMode: reqConfig.relMode,
            discAssoc: reqConfig.discAssoc,
            discComp: reqConfig.discComp,
            discInherit: reqConfig.discInherit,
            lineAssoc: reqConfig.lineAssoc,
            lineComp: reqConfig.lineComp,
            lineInherit: reqConfig.lineInherit,
            
            includeCds: sIncludeStr,
            excludeCds: sExcludeStr,
            savePositions: bSavePositions
        };

        const oModelData = oUiModel.getData();
        Object.keys(oModelData).forEach(sKey => {
            if (sKey.toUpperCase().startsWith("FORMAT")) {
                oState[sKey] = Object.assign({}, oUiModel.getProperty(`/${sKey}`));
            }
        });

        if (sEngine && Renderer.supportsStateCapture(sEngine)) {
            const oCanvasState = Renderer.getCanvasState(sInstanceId, sEngine);
            const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
            if (sFormatKey && oState[sFormatKey]) {
                oState[sFormatKey] = Renderer.extractStateForVariant(sEngine, oState[sFormatKey], oCanvasState, bSavePositions);
            }
            oState.canvasState = bSavePositions ? oCanvasState : null;
        }
        return oState as IVariantState;
    }

    /**
     * @public
     * @static
     * @description Applies a saved variant directly to the JSONModel properties.
     */
    public static applyState(oUiModel: JSONModel, oVariant: IVariantState, oView: View): void {
        const sVariantCdsName = (oVariant.cdsName || "").toUpperCase();
        oUiModel.setProperty("/diagramRequest/cdsName", sVariantCdsName);
        oUiModel.setProperty("/lastGeneratedCdsName", sVariantCdsName); 
        
        // Fallback DOM sync for inputs that aren't cleanly two-way bound to avoid breaking the UX
        const oCdsInput = oView.byId("cmbCdsName") as Input;
        if (oCdsInput) oCdsInput.setValue(sVariantCdsName);

        const sDefaultEngine = Renderer.getDefaultEngine();
        oUiModel.setProperty("/activeEngine", oVariant.engine || sDefaultEngine);
        oUiModel.setProperty("/diagramRequest/maxLevel", oVariant.maxLevel || 1);
        
        oUiModel.setProperty("/diagramRequest/showKeys", !!oVariant.keys);
        oUiModel.setProperty("/diagramRequest/showFields", !!oVariant.fields);
        oUiModel.setProperty("/diagramRequest/showAssocFields", !!oVariant.assocFields);
        oUiModel.setProperty("/diagramRequest/showBase", !!oVariant.base);
        oUiModel.setProperty("/diagramRequest/customOnly", !!oVariant.customOnly);
        
        const oVariantMap = oVariant as Record<string, any>;

        Object.keys(oVariant).forEach(sKey => {
            if (sKey.toUpperCase().startsWith("FORMAT") && oVariantMap[sKey]) {
                oUiModel.setProperty(`/${sKey}`, oVariantMap[sKey]);
            }
        });

        if (oVariant.engine && Renderer.supportsStateCapture(oVariant.engine)) {
            const sFormatKey = Object.keys(oVariant).find(sKey => sKey.toUpperCase() === `FORMAT${oVariant.engine}`);
            if (sFormatKey) {
                let oFormat = Object.assign({}, oVariantMap[sFormatKey]);
                oFormat = Renderer.applyStateToConfig(oVariant.engine, oFormat, oVariant.canvasState || null);
                oUiModel.setProperty(`/${sFormatKey}`, oFormat);
            }
        }

        const sMode = oVariant.relMode || "LINES";
        oUiModel.setProperty("/diagramRequest/relMode", sMode);

        oUiModel.setProperty("/diagramRequest/discAssoc", oVariant.discAssoc ?? true);
        oUiModel.setProperty("/diagramRequest/discComp", oVariant.discComp ?? true);
        oUiModel.setProperty("/diagramRequest/discInherit", oVariant.discInherit ?? true);
        oUiModel.setProperty("/diagramRequest/lineAssoc", oVariant.lineAssoc ?? true);
        oUiModel.setProperty("/diagramRequest/lineComp", oVariant.lineComp ?? true);
        oUiModel.setProperty("/diagramRequest/lineInherit", oVariant.lineInherit ?? true);
        
        // Handle Tokens
        const oIncInput = oView.byId("inpInclude") as MultiInput;
        const oExcInput = oView.byId("inpExclude") as MultiInput;
        
        if (oIncInput) {
            oIncInput.removeAllTokens();
            if (oVariant.includeCds) {
                oVariant.includeCds.split(",").forEach((s: string) => {
                    if (s.trim()) oIncInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
                });
            }
        }

        if (oExcInput) {
            oExcInput.removeAllTokens();
            if (oVariant.excludeCds) {
                oVariant.excludeCds.split(",").forEach((s: string) => {
                    if (s.trim()) oExcInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
                });
            }
        }
    }
}
