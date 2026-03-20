/**
 * @fileoverview Network utilities for dynamic dependency injection.
 * @description Manages asynchronous loading of external visualization libraries.
 */
export default class NetworkManager {
    private static _scriptPromises: Record<string, Promise<void> | undefined> = {};

    /**
     * @public
     * @description Injects a script tag into the DOM for a given CDN URL. Implements
     * promise caching to ensure rapid re-renders do not trigger redundant network requests.
     * @param {string} src - The fully qualified CDN URL to load.
     * @returns {Promise<void>} Resolves when the script emits the 'onload' event.
     * @throws {Error} Rejects if the script fails to load, clearing the cache to allow retries.
     */
    public static loadScript(src: string): Promise<void> {
        if (this._scriptPromises[src]) return this._scriptPromises[src]!;
        
        const newPromise = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => { 
                delete this._scriptPromises[src]; 
                reject(new Error(`Failed to load CDN: ${src}`)); 
            };
            document.head.appendChild(script);
        });
        
        this._scriptPromises[src] = newPromise;
        return newPromise;
    }
}