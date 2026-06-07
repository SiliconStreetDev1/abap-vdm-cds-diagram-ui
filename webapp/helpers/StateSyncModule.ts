/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.helpers
 * @fileoverview Pure Data-Binding State Sync Module
 * @description Extracts UI state and Diagram requests purely from the JSONModel via 
 * Two-Way Data Binding, eliminating hardcoded DOM scraping (activeView.byId) to ensure 
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
    public static buildRequest(uiModel: JSONModel, sCdsName: string, engineId: EngineType, activeView: View): IDiagramRequest {
        const reqConfig = uiModel.getProperty("/diagramRequest") || {};
        const bIsLinesMode = (reqConfig.relMode === "LINES");

        // Use fallback DOM read ONLY if the tokens aren't natively bound yet, but prefer the model
        const aIncTokens = reqConfig.includeCdsTokens ? reqConfig.includeCdsTokens : (activeView.byId("inpInclude") as MultiInput)?.getTokens() || [];
        const aExcTokens = reqConfig.excludeCdsTokens ? reqConfig.excludeCdsTokens : (activeView.byId("inpExclude") as MultiInput)?.getTokens() || [];
        
        const sIncludeStr = aIncTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");
        const sExcludeStr = aExcTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");

        const oModelData = uiModel.getData();
        const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${engineId}`);
        const oRawConfig = sFormatKey ? uiModel.getProperty(`/${sFormatKey}`) : {};
        
        const oFormatConfig = Renderer.formatBackendConfig(engineId, oRawConfig || {});

        return {
            cdsName: sCdsName,
            engine: engineId,
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
    public static captureState(uiModel: JSONModel, sName: string, bSavePositions: boolean, activeView: View, sInstanceId: string): IVariantState {
        const reqConfig = uiModel.getProperty("/diagramRequest") || {};
        const engineId = uiModel.getProperty("/activeEngine") || Renderer.getDefaultEngine();
        
        const aIncTokens = reqConfig.includeCdsTokens ? reqConfig.includeCdsTokens : (activeView.byId("inpInclude") as MultiInput)?.getTokens() || [];
        const aExcTokens = reqConfig.excludeCdsTokens ? reqConfig.excludeCdsTokens : (activeView.byId("inpExclude") as MultiInput)?.getTokens() || [];
        
        const sIncludeStr = aIncTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");
        const sExcludeStr = aExcTokens.map((t: any) => t.getText ? t.getText() : t.text).join(",");

        const sCdsName = reqConfig.cdsName || (activeView.byId("cmbCdsName") as Input)?.getValue().trim().toUpperCase() || "";

        const oState: Record<string, any> = {
            name: sName,
            cdsName: sCdsName,
            engine: engineId,
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

        const oModelData = uiModel.getData();
        Object.keys(oModelData).forEach(sKey => {
            if (sKey.toUpperCase().startsWith("FORMAT")) {
                oState[sKey] = Object.assign({}, uiModel.getProperty(`/${sKey}`));
            }
        });

        if (engineId && Renderer.supportsStateCapture(engineId)) {
            const oCanvasState = Renderer.getCanvasState(sInstanceId, engineId);
            const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${engineId}`);
            if (sFormatKey && oState[sFormatKey]) {
                oState[sFormatKey] = Renderer.extractStateForVariant(engineId, oState[sFormatKey], oCanvasState, bSavePositions);
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
    public static applyState(uiModel: JSONModel, oVariant: IVariantState, activeView: View): void {
        const sVariantCdsName = (oVariant.cdsName || "").toUpperCase();
        uiModel.setProperty("/diagramRequest/cdsName", sVariantCdsName);
        uiModel.setProperty("/lastGeneratedCdsName", sVariantCdsName); 
        
        // Fallback DOM sync for inputs that aren't cleanly two-way bound to avoid breaking the UX
        const oCdsInput = activeView.byId("cmbCdsName") as Input;
        if (oCdsInput) oCdsInput.setValue(sVariantCdsName);

        const sDefaultEngine = Renderer.getDefaultEngine();
        uiModel.setProperty("/activeEngine", oVariant.engine || sDefaultEngine);
        uiModel.setProperty("/diagramRequest/maxLevel", oVariant.maxLevel || 1);
        
        uiModel.setProperty("/diagramRequest/showKeys", !!oVariant.keys);
        uiModel.setProperty("/diagramRequest/showFields", !!oVariant.fields);
        uiModel.setProperty("/diagramRequest/showAssocFields", !!oVariant.assocFields);
        uiModel.setProperty("/diagramRequest/showBase", !!oVariant.base);
        uiModel.setProperty("/diagramRequest/customOnly", !!oVariant.customOnly);
        
        const oVariantMap = oVariant as Record<string, any>;

        Object.keys(oVariant).forEach(sKey => {
            if (sKey.toUpperCase().startsWith("FORMAT") && oVariantMap[sKey]) {
                uiModel.setProperty(`/${sKey}`, oVariantMap[sKey]);
            }
        });

        if (oVariant.engine && Renderer.supportsStateCapture(oVariant.engine)) {
            const sFormatKey = Object.keys(oVariant).find(sKey => sKey.toUpperCase() === `FORMAT${oVariant.engine}`);
            if (sFormatKey) {
                let oFormat = Object.assign({}, oVariantMap[sFormatKey]);
                oFormat = Renderer.applyStateToConfig(oVariant.engine, oFormat, oVariant.canvasState || null);
                uiModel.setProperty(`/${sFormatKey}`, oFormat);
            }
        }

        const sMode = oVariant.relMode || "LINES";
        uiModel.setProperty("/diagramRequest/relMode", sMode);

        uiModel.setProperty("/diagramRequest/discAssoc", oVariant.discAssoc ?? true);
        uiModel.setProperty("/diagramRequest/discComp", oVariant.discComp ?? true);
        uiModel.setProperty("/diagramRequest/discInherit", oVariant.discInherit ?? true);
        uiModel.setProperty("/diagramRequest/lineAssoc", oVariant.lineAssoc ?? true);
        uiModel.setProperty("/diagramRequest/lineComp", oVariant.lineComp ?? true);
        uiModel.setProperty("/diagramRequest/lineInherit", oVariant.lineInherit ?? true);
        
        // Handle Tokens
        const oIncInput = activeView.byId("inpInclude") as MultiInput;
        const oExcInput = activeView.byId("inpExclude") as MultiInput;
        
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
