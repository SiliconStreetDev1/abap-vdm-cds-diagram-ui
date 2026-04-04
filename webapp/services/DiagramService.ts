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

        } catch (oError: unknown) {
            throw new Error(DiagramService.extractErrorMessage(oError));
        }
    }

    /**
     * @public
     * @description Extracts a clean, user-facing error message from deeply nested OData V4 /
     * ABAP backend error structures. Strips stack traces and technical noise.
     * Returns either a real error message string or an i18n key (e.g. "msgBackendError")
     * that the caller must translate via their resource bundle.
     * @param {unknown} oError - The raw error thrown by the OData V4 model or runtime.
     * @returns {string} A sanitized error message or i18n key suitable for UI display.
     */
    public static extractErrorMessage(oError: unknown): string {
        if (!(oError instanceof Object)) {
            return String(oError) || "msgBackendError";
        }

        const oErr = oError as Record<string, unknown>;

        // Layer 1: Nested OData V4 JSON error body (e.g. { error: { message: "..." } })
        const oInner = oErr.error as Record<string, unknown> | undefined;
        if (oInner && typeof oInner.message === "string" && oInner.message) {
            return DiagramService._stripStackTrace(oInner.message);
        }

        // Layer 2: Chained cause (e.g. oError.cause.message)
        const oCause = oErr.cause as Record<string, unknown> | undefined;
        if (oCause && typeof oCause.message === "string" && oCause.message) {
            return DiagramService._stripStackTrace(oCause.message);
        }

        // Layer 3: Raw response text – attempt JSON parse for OData error envelope
        if (typeof oErr.responseText === "string" && oErr.responseText) {
            const sParsed = DiagramService._parseResponseText(oErr.responseText);
            if (sParsed) return sParsed;
        }

        // Layer 4: Direct message property (standard Error objects)
        if (typeof oErr.message === "string" && oErr.message) {
            return DiagramService._stripStackTrace(oErr.message);
        }

        return "msgBackendError";
    }

    /**
     * @private
     * @description Attempts to parse a raw HTTP response body for an OData JSON error message.
     * @param {string} sResponseText - The raw response body string.
     * @returns {string} The extracted message, or empty string if parsing fails.
     */
    private static _parseResponseText(sResponseText: string): string {
        try {
            const oParsed = JSON.parse(sResponseText) as Record<string, unknown>;
            const oErr = oParsed.error as Record<string, unknown> | undefined;
            if (oErr && typeof oErr.message === "string" && oErr.message) {
                return DiagramService._stripStackTrace(oErr.message);
            }
        } catch {
            // Not JSON – ignore
        }
        return "";
    }

    /**
     * @private
     * @description Removes stack trace fragments that backends may append to error messages.
     * @param {string} sMessage - The raw error message.
     * @returns {string} The cleaned message without stack trace lines.
     */
    private static _stripStackTrace(sMessage: string): string {
        // Trim any trailing/leading whitespace
        let sClean = sMessage.trim();

        // Strip anything after common stack trace markers
        const aStackMarkers = ["\n    at ", "\nError:", "\n    at\t", "\nCaused by:"];
        for (const sMarker of aStackMarkers) {
            const iIdx = sClean.indexOf(sMarker);
            if (iIdx > 0) {
                sClean = sClean.substring(0, iIdx).trim();
            }
        }

        return sClean || "msgBackendError";
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