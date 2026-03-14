/**
 * @fileoverview Variant and History Management Utility
 * @author Silicon Street Limited
 * * DESIGN RATIONALE:
 * By extracting localStorage interactions into a dedicated static class, 
 * we keep the Main controller clean and make it easier to replace 
 * localStorage with an OData/Backend variant service in the future if required.
 */
export default class VariantManager {
    
    // Local storage keys
    private static readonly KEY_HISTORY = "vdmSearchHistory";
    private static readonly KEY_VARIANTS = "vdmVariants";

    /**
     * Retrieves the 10 most recent CDS searches.
     */
    public static getHistory(): any[] {
        const sHistory = localStorage.getItem(this.KEY_HISTORY);
        return sHistory ? JSON.parse(sHistory) : [];
    }

    /**
     * Acts as an LRU (Least Recently Used) Cache.
     * Pushes the new search to the top, removes duplicates, and trims the list to 10.
     */
    public static updateHistory(sName: string): any[] {
        let aHistory = this.getHistory();
        // Remove if it already exists to prevent duplicates
        aHistory = aHistory.filter((item: any) => item.name !== sName);
        // Add to the very top (index 0)
        aHistory.unshift({ name: sName });
        // Enforce the 10-item limit
        if (aHistory.length > 10) aHistory.pop();
        
        localStorage.setItem(this.KEY_HISTORY, JSON.stringify(aHistory));
        return aHistory;
    }

    /**
     * Retrieves all saved user variants (UI settings configurations).
     */
    public static getVariants(): any[] {
        const sVariants = localStorage.getItem(this.KEY_VARIANTS);
        return sVariants ? JSON.parse(sVariants) : [];
    }

    /**
     * Saves or overwrites a specific variant state.
     */
    public static saveVariant(oState: any): any[] {
        let aVariants = this.getVariants();
        // Remove existing item if overwriting, then push the fresh state
        aVariants = aVariants.filter(v => v.name !== oState.name);
        aVariants.push(oState);
        
        localStorage.setItem(this.KEY_VARIANTS, JSON.stringify(aVariants));
        return aVariants;
    }

    /**
     * Deletes a variant by name.
     */
    public static deleteVariant(sName: string): any[] {
        let aVariants = this.getVariants();
        aVariants = aVariants.filter(v => v.name !== sName);
        
        localStorage.setItem(this.KEY_VARIANTS, JSON.stringify(aVariants));
        return aVariants;
    }
}