/**
 * @fileoverview Core Data Service for Search History Persistence.
 * @description Pure data access layer for maintaining CDS view search history. 
 * Executes LocalStorage operations and acts as an LRU cache for recent searches.
 * Extracted from VariantService to enforce the Single Responsibility Principle.
 */

export default class SearchHistoryService {
    private static readonly HISTORY_KEY = "vdmSearchHistory";

    /**
     * @public
     * @static
     * @description Retrieves the 10 most recent CDS searches from LocalStorage.
     * Used to hydrate the MultiInput suggestion dropdowns instantly without network latency.
     * @returns {Array<{name: string}>} Array of historical search objects.
     */
    public static getHistory(): Array<{name: string}> {
        const historyJson = localStorage.getItem(this.HISTORY_KEY);
        if (!historyJson) return [];
        
        try {
            return JSON.parse(historyJson);
        } catch (error) {
            console.error("VDM Diagrammer: Corrupted search history found in LocalStorage. Resetting.", error);
            localStorage.removeItem(this.HISTORY_KEY);
            return [];
        }
    }

    /**
     * @public
     * @static
     * @description Acts as an LRU (Least Recently Used) cache for search history.
     * Pushes the new search to the top, removes duplicates, and trims the stack to prevent LocalStorage bloat.
     * @param {string} name - The newly searched CDS view name.
     * @returns {Array<{name: string}>} The updated history array.
     */
    public static updateHistory(name: string): Array<{name: string}> {
        let history = this.getHistory();
        history = history.filter(item => item.name !== name);
        history.unshift({ name });
        if (history.length > 10) history.pop();
        
        try {
            localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
        } catch (error) {
            console.warn("VDM Diagrammer: LocalStorage history quota exceeded.");
        }
        return history;
    }
}