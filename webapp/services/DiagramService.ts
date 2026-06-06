/**
 * @fileoverview Data Access and API Service for VDM Diagrams.
 * @description Decouples the UI from the OData V4 implementation. Handles network execution, 
 * deep ABAP error extraction, and enterprise payload size gatekeeping.
 */

import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DiagramCache from "./DiagramCache";

export interface IDiagramResult {
    DiagramPayload: string;
    FileExtension: string;
    CdsName: string;
}

export interface IDiagramRequest {
    cdsName: string;
    engine: string;
    maxLevel: number;
    showKeys: boolean;
    showFields: boolean;
    showAssocFields: boolean;
    showBase: boolean;
    customOnly: boolean;
    lineAssoc: boolean;
    lineComp: boolean;
    lineInherit: boolean;
    discAssoc: boolean;
    discComp: boolean;
    discInherit: boolean;
    includeCds: string;
    excludeCds: string;
    formatConfigJson: string;
}

export default class DiagramService {

    public static clearCache(): void {
        DiagramCache.clear();
    }

    /**
     * @public
     * @description Validates whether a CDS View exists in the backend before running an expensive generation request.
     * @param {ODataModel} oModel - The active OData V4 model instance.
     * @param {string} cdsName - The CDS view name to validate.
     * @returns {Promise<boolean>} True if the CDS view exists, false otherwise.
     */
    public static async validateCds(oModel: ODataModel, cdsName: string): Promise<boolean> {
        const searchBinding = oModel.bindList("/Search", undefined, undefined, [
            new Filter("CdsName", FilterOperator.EQ, cdsName)
        ]);
        
        try {
            const searchContexts = await searchBinding.requestContexts(0, 1);
            return searchContexts.length > 0;
        } catch (e: any) {
            let sErrorMsg = e.message || "Unknown error";
            if (e.error && e.error.message) {
                sErrorMsg = e.error.message;
            }
            throw new Error(`Backend Error: ${sErrorMsg}`);
        } finally {
            searchBinding.destroy();
        }
    }

    /**
     * @public
     * @description Executes the OData V4 list binding request and parses the backend response.
     * Encapsulates all OData filter logic internally to decouple the UI from the protocol.
     * @param {ODataModel} oModel - The active OData V4 model instance.
     * @param {IDiagramRequest} oRequest - The standardized DTO containing request parameters.
     * @param {boolean} [bForceRefresh=false] - Bypasses the LRU cache to fetch fresh data from the backend.
     * @returns {Promise<IDiagramResult>} A promise resolving to the validated backend payload.
     * @throws {Error} Throws normalized error strings suitable for UI display.
     */
    public static async fetchDiagram(oModel: ODataModel, oRequest: IDiagramRequest, bForceRefresh: boolean = false, bSkipCacheCheck: boolean = false): Promise<IDiagramResult> {
        const aFilters = [
            new Filter("CdsName", FilterOperator.EQ, oRequest.cdsName),
            new Filter("RendererEngine", FilterOperator.EQ, oRequest.engine),
            new Filter("MaxLevel", FilterOperator.EQ, oRequest.maxLevel),
            new Filter("ShowKeys", FilterOperator.EQ, oRequest.showKeys),
            new Filter("ShowFields", FilterOperator.EQ, oRequest.showFields),
            new Filter("ShowAssocFields", FilterOperator.EQ, oRequest.showAssocFields),
            new Filter("ShowBase", FilterOperator.EQ, oRequest.showBase),
            new Filter("CustomDevOnly", FilterOperator.EQ, oRequest.customOnly),
            new Filter("LineAssoc", FilterOperator.EQ, oRequest.lineAssoc),
            new Filter("LineComp", FilterOperator.EQ, oRequest.lineComp),
            new Filter("LineInherit", FilterOperator.EQ, oRequest.lineInherit),
            new Filter("DiscAssoc", FilterOperator.EQ, oRequest.discAssoc),
            new Filter("DiscComp", FilterOperator.EQ, oRequest.discComp),
            new Filter("DiscInherit", FilterOperator.EQ, oRequest.discInherit),
            new Filter("FormatConfig", FilterOperator.EQ, oRequest.formatConfigJson)
        ];

        if (oRequest.includeCds) aFilters.push(new Filter("IncludeCds", FilterOperator.EQ, oRequest.includeCds));
        if (oRequest.excludeCds) aFilters.push(new Filter("ExcludeCds", FilterOperator.EQ, oRequest.excludeCds));

        // 1. Check LRU Cache before hitting the network
        if (!bSkipCacheCheck) {
            const oCachedResult = bForceRefresh ? null : DiagramCache.get(oRequest);
            if (oCachedResult) {
                return oCachedResult;
            }
        }

        const oListBinding = oModel.bindList("/Diagram") as ODataListBinding;
        oListBinding.filter(aFilters);

        try {
            const aContexts = await oListBinding.requestContexts(0, 1);
            
            if (!aContexts || aContexts.length === 0) {
                throw new Error("msgNoMeta");
            }

            const oResult = aContexts[0].getObject() as IDiagramResult;

            if (oResult.DiagramPayload.startsWith("Error:")) {
                throw new Error(oResult.DiagramPayload.replace("Error: ", ""));
            }

        // 2. Commit to Cache to optimize subsequent visits
        DiagramCache.set(oRequest, oResult);

            return oResult;

        } catch (oError: any) {
            let sErrorMsg = oError.message || "Unknown error";
            if (oError.error && oError.error.message) {
                sErrorMsg = oError.error.message;
            }
            throw new Error(sErrorMsg);
        } finally {
            // ENTERPRISE FIX: Destroy transient bindings to prevent ODataModel memory leaks
            oListBinding.destroy();
        }
    }
}