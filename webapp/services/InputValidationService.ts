/**
 * @fileoverview Business Rule Service for Input Validation.
 * @description Isolates token validation logic for MultiInputs. Enforces enterprise rules 
 * such as uppercase normalization, wildcard blocking, and cross-field duplicate prevention.
 */

import Token from "sap/m/Token";
import MultiInput from "sap/m/MultiInput";

export default class InputValidationService {
    
    /**
     * @public
     * @description Generates a token validator function formatted for SAP UI5 MultiInputs.
     * @param {MultiInput} oIncludeInput - The inclusion field instance.
     * @param {MultiInput} oExcludeInput - The exclusion field instance.
     * @param {(sMsgKey: string) => void} fnShowWarning - Callback to display localized validation errors.
     * @returns {(args: { text: string }) => Token | null} The validator function required by UI5.
     */
    public static buildTokenValidator(
        oIncludeInput: MultiInput, 
        oExcludeInput: MultiInput, 
        fnShowWarning: (sMsgKey: string) => void
    ): (args: { text: string }) => Token | null {
        
        return (args: { text: string }) => {
            const sCleanText = args.text.trim().toUpperCase();

            if (sCleanText.includes("*") || sCleanText.includes("%")) {
                fnShowWarning("msgWildcardWarn");
                return null;
            }

            if (!sCleanText) {
                return null;
            }

            const aIncTokens = oIncludeInput.getTokens();
            const aExcTokens = oExcludeInput.getTokens();

            if ([...aIncTokens, ...aExcTokens].some(t => t.getKey() === sCleanText)) {
                fnShowWarning("msgDuplicateWarn");
                return null;
            }

            return new Token({ key: sCleanText, text: sCleanText });
        };
    }
}