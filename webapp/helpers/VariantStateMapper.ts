/**
 * @fileoverview Maps variant data between the UI state and the persistence layer.
 * @description Extracts the complex deep-mapping logic away from the VariantHandler.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Select from "sap/m/Select";
import ComboBox from "sap/m/ComboBox";
import StepInput from "sap/m/StepInput";
import Switch from "sap/m/Switch";
import SegmentedButton from "sap/m/SegmentedButton";
import MultiInput from "sap/m/MultiInput";
import Token from "sap/m/Token";
import VBox from "sap/m/VBox";
import Renderer from "../renderer/Renderer";
import { IVariantState } from "../types/IVariantState";

export default class VariantStateMapper {
    /**
     * @public
     * @static
     * @description Captures the current state of the UI and the Canvas (if applicable) into a serializable object.
     */
    public static captureState(oView: View, sName: string, bSavePositions: boolean): IVariantState {
        const aIncTokens = (oView.byId("inpInclude") as MultiInput).getTokens();
        const aExcTokens = (oView.byId("inpExclude") as MultiInput).getTokens();
        
        const oUiModel = oView.getModel("ui") as JSONModel;
        const sEngine = (oView.byId("selEngine") as Select).getSelectedKey();
        
        const oCanvasState = (sEngine === "CYTOSCAPE" && bSavePositions) ? Renderer.getCanvasState(sEngine) : null;
        
        const oFormatCy = Object.assign({}, oUiModel.getProperty("/formatCytoscape"));
        if (bSavePositions && sEngine === "CYTOSCAPE") {
            oFormatCy.presetPositions = oCanvasState;
        } else {
            oFormatCy.presetPositions = null; // Prevent ghost coordinates from saving
        }

        return {
            name: sName,
            cdsName: (oView.byId("cmbCdsName") as ComboBox).getValue().trim().toUpperCase(), // Normalizes to prevent the Uppercase Bug
            engine: sEngine,
            maxLevel: (oView.byId("stepMaxLevel") as StepInput).getValue(),
            keys: (oView.byId("swKeys") as Switch).getState(),
            fields: (oView.byId("swFields") as Switch).getState(),
            assocFields: (oView.byId("swAssocFields") as Switch).getState(),
            base: (oView.byId("swBase") as Switch).getState(),
            customOnly: (oView.byId("swCustomOnly") as Switch).getState(),
            
            relMode: (oView.byId("segRelMode") as SegmentedButton).getSelectedKey(),
            discAssoc: (oView.byId("swDiscAssoc") as Switch).getState(),
            discComp: (oView.byId("swDiscComp") as Switch).getState(),
            discInherit: (oView.byId("swDiscInherit") as Switch).getState(),
            lineAssoc: (oView.byId("swLineAssoc") as Switch).getState(),
            lineComp: (oView.byId("swLineComp") as Switch).getState(),
            lineInherit: (oView.byId("swLineInherit") as Switch).getState(),
            
            includeCds: aIncTokens.map(t => t.getText()).join(","),
            excludeCds: aExcTokens.map(t => t.getText()).join(","),
            
            formatPlantUML: oUiModel.getProperty("/formatPlantUML"),
            formatGraphviz: oUiModel.getProperty("/formatGraphviz"),
            formatMermaid: oUiModel.getProperty("/formatMermaid"),
            formatCytoscape: oFormatCy,
            canvasState: oCanvasState
        };
    }

    /**
     * @public
     * @static
     * @description Applies a saved variant object to the UI controls and models.
     */
    public static applyState(oView: View, oVariant: IVariantState): void {
        const oUiModel = oView.getModel("ui") as JSONModel;

        const sVariantCdsName = (oVariant.cdsName || "").toUpperCase(); // Normalizes to prevent the Uppercase Bug
        (oView.byId("cmbCdsName") as ComboBox).setValue(sVariantCdsName);
        oUiModel.setProperty("/lastGeneratedCdsName", sVariantCdsName); 

        (oView.byId("selEngine") as Select).setSelectedKey(oVariant.engine);
        (oView.byId("stepMaxLevel") as StepInput).setValue(oVariant.maxLevel);
        (oView.byId("swKeys") as Switch).setState(oVariant.keys);
        (oView.byId("swFields") as Switch).setState(oVariant.fields);
        (oView.byId("swAssocFields") as Switch).setState(oVariant.assocFields);
        (oView.byId("swBase") as Switch).setState(oVariant.base);
        (oView.byId("swCustomOnly") as Switch).setState(oVariant.customOnly);
        
        oUiModel.setProperty("/activeEngine", oVariant.engine || "PLANTUML");
        if (oVariant.formatPlantUML) oUiModel.setProperty("/formatPlantUML", oVariant.formatPlantUML);
        if (oVariant.formatGraphviz) oUiModel.setProperty("/formatGraphviz", oVariant.formatGraphviz);
        if (oVariant.formatMermaid) oUiModel.setProperty("/formatMermaid", oVariant.formatMermaid);
        
        if (oVariant.formatCytoscape) {
            const oFormatCy = Object.assign({}, oVariant.formatCytoscape);
            oFormatCy.presetPositions = oVariant.canvasState || null;
            
            oUiModel.setProperty("/formatCytoscape", oFormatCy);
        }

        const sMode = oVariant.relMode || "LINES";
        (oView.byId("segRelMode") as SegmentedButton).setSelectedKey(sMode);
        (oView.byId("boxLines") as VBox).setVisible(sMode === "LINES");
        (oView.byId("boxDiscovery") as VBox).setVisible(sMode !== "LINES");

        (oView.byId("swDiscAssoc") as Switch).setState(oVariant.discAssoc ?? true);
        (oView.byId("swDiscComp") as Switch).setState(oVariant.discComp ?? true);
        (oView.byId("swDiscInherit") as Switch).setState(oVariant.discInherit ?? true);
        (oView.byId("swLineAssoc") as Switch).setState(oVariant.lineAssoc ?? true);
        (oView.byId("swLineComp") as Switch).setState(oVariant.lineComp ?? true);
        (oView.byId("swLineInherit") as Switch).setState(oVariant.lineInherit ?? true);
        
        const oIncInput = oView.byId("inpInclude") as MultiInput;
        const oExcInput = oView.byId("inpExclude") as MultiInput;
        
        oIncInput.removeAllTokens();
        if (oVariant.includeCds) {
            oVariant.includeCds.split(",").forEach((s: string) => {
                if (s.trim()) oIncInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
            });
        }

        oExcInput.removeAllTokens();
        if (oVariant.excludeCds) {
            oVariant.excludeCds.split(",").forEach((s: string) => {
                if (s.trim()) oExcInput.addToken(new Token({ key: s.trim(), text: s.trim() }));
            });
        }
    }
}