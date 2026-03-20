/**
 * @fileoverview Network utilities for dynamic dependency injection.
 * @description Manages asynchronous loading of external visualization libraries.
 */

export default class NetworkManager {
    private static _scriptPromises: Record<string, Promise<void> | undefined> = {};

    /**
     * @public
     * @description Injects a script tag into the DOM for a given CDN URL.
     * @param {string | undefined} src - The fully qualified CDN URL to load.
     * @returns {Promise<void>} Resolves when the script emits the 'onload' event.
     */
    public static loadScript(src: string | undefined): Promise<void> {
        if (!src) return Promise.reject(new Error("CDN Source is undefined."));
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