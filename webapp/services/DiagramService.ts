/**
 * @fileoverview Data Access and API Service for VDM Diagrams.
 * @description Decouples the UI from the OData V4 implementation. Handles network execution, 
 * deep ABAP error extraction, and enterprise payload size gatekeeping.
 */

import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";

export interface IDiagramResult {
    DiagramPayload: string;
    FileExtension: string;
    CdsName: string;
}

export default class DiagramService {

    /**
     * @public
     * @description Executes the OData V4 list binding request and parses the backend response.
     * @param {ODataModel} oModel - The active OData V4 model instance.
     * @param {Filter[]} aFilters - The dynamically generated array of UI filters.
     * @returns {Promise<IDiagramResult>} A promise resolving to the validated backend payload.
     * @throws {Error} Throws normalized error strings suitable for UI display.
     */
    public static async fetchDiagram(oModel: ODataModel, aFilters: Filter[]): Promise<IDiagramResult> {
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

            return oResult;

        } catch (oError: any) {
            let sErrorMsg = oError.message || "Unknown error";
            if (oError.error && oError.error.message) {
                sErrorMsg = oError.error.message;
            }
            throw new Error(sErrorMsg);
        }
    }

    /**
     * @public
     * @description Enforces rendering limits to prevent browser thread crashes.
     * @param {string} sPayload - The raw syntax payload from the backend.
     * @param {number} [iMaxSizeKb=100] - The maximum allowable size in kilobytes.
     * @returns {void}
     * @throws {Error} Throws if the payload exceeds the safe rendering threshold.
     */
    public static validatePayloadSize(sPayload: string, iMaxSizeKb: number = 100): void {
        const iMaxChars = iMaxSizeKb * 1024;
        
        if (sPayload.length > iMaxChars) {
            const iActualKb = Math.round(sPayload.length / 1024);
            throw new Error(`Diagram too large to render (${iActualKb} KB). Please use "Download Source".`);
        }
    }
}