/**
 * @fileoverview Variant and History Management Utility
 * @author Silicon Street Limited
 * * DESIGN RATIONALE:
 * By extracting localStorage interactions into a dedicated static class, 
 * we keep the Main controller clean and make it easier to replace 
 * localStorage with an OData/Backend variant service in the future if required.
 */
import { IVariantState } from "../types/IVariantState";

export default class VariantManager {
    
    // Local storage keys
    private static readonly KEY_HISTORY = "vdmSearchHistory";
    private static readonly KEY_VARIANTS = "vdmVariants";

    /**
     * @public
     * @static
     * @description Retrieves the 10 most recent CDS searches from LocalStorage.
     * @returns {Array<{name: string}>} Array of historical search objects.
     */
    public static getHistory(): Array<{name: string}> {
        const sHistory = localStorage.getItem(this.KEY_HISTORY);
        return sHistory ? JSON.parse(sHistory) : [];
    }

    /**
     * @public
     * @static
     * @description Acts as an LRU (Least Recently Used) Cache. Pushes the new search to the top, removes duplicates, and trims the list to 10.
     * @param {string} sName - The newly searched CDS view name.
     * @returns {Array<{name: string}>} The updated history array.
     */
    public static updateHistory(sName: string): Array<{name: string}> {
        let aHistory = this.getHistory();
        aHistory = aHistory.filter(item => item.name !== sName);
        aHistory.unshift({ name: sName });
        if (aHistory.length > 10) aHistory.pop();
        
        try {
            localStorage.setItem(this.KEY_HISTORY, JSON.stringify(aHistory));
        } catch (e) {
            console.warn("VDM Diagrammer: LocalStorage history quota exceeded. History not updated.");
        }
        return aHistory;
    }

    /**
     * @public
     * @static
     * @description Retrieves all saved user variants (UI settings configurations) from LocalStorage.
     * @returns {IVariantState[]} Array of strictly typed variant configurations.
     */
    public static getVariants(): IVariantState[] {
        const sVariants = localStorage.getItem(this.KEY_VARIANTS);
        return sVariants ? JSON.parse(sVariants) : [];
    }

    /**
     * @public
     * @static
     * @description Saves or overwrites a specific variant state to LocalStorage.
     * @param {IVariantState} oState - The fully serialized variant state object.
     * @returns {IVariantState[]} The updated array of variants.
     */
    public static saveVariant(oState: IVariantState): IVariantState[] {
        let aVariants = this.getVariants();
        aVariants = aVariants.filter(v => v.name !== oState.name);
        aVariants.push(oState);
        
        try {
            localStorage.setItem(this.KEY_VARIANTS, JSON.stringify(aVariants));
        } catch (e: any) {
            // Enterprise Fix: Gracefully trap 5MB DOMException quota limits.
            throw new Error("Local Storage Quota Exceeded. Please delete older variants to save new ones.");
        }
        return aVariants;
    }

    /**
     * @public
     * @static
     * @description Deletes a variant from LocalStorage by its unique name.
     * @param {string} sName - The name of the variant to delete.
     * @returns {IVariantState[]} The updated array of variants after deletion.
     */
    public static deleteVariant(sName: string): IVariantState[] {
        let aVariants = this.getVariants();
        aVariants = aVariants.filter(v => v.name !== sName);
        
        try {
            localStorage.setItem(this.KEY_VARIANTS, JSON.stringify(aVariants));
        } catch (e) {
            console.warn("VDM Diagrammer: Failed to update local storage during deletion.");
        }
        return aVariants;
    }
}