
/**
 * @fileoverview Network utilities for dynamic dependency injection.
 * @description Manages asynchronous loading of external visualization libraries
 * using a local-first, CDN-fallback strategy to ensure enterprise resilience.
 */

export default class NetworkManager {
    private static _scriptPromises: Record<string, Promise<void> | undefined> = {};

    /**
     * @public
     * @description Injects a script tag into the DOM. Attempts local source first, 
     * failing over to the CDN source if the local file is unavailable.
     * @param {string | undefined} localSrc - The primary local repository path.
     * @param {string | undefined} cdnSrc - The fallback external CDN URL.
     * @returns {Promise<void>} Resolves when the script emits the 'onload' event.
     */
    public static loadScript(localSrc?: string, cdnSrc?: string): Promise<void> {
        
        // UI5 Path Resolution Fix: 
        // Relative paths in injected scripts resolve against the host HTML page (e.g., FLP), 
        // not the Component root. We must translate relative './' paths into absolute UI5 module paths.
        let resolvedLocalSrc = localSrc;
        if (resolvedLocalSrc && resolvedLocalSrc.startsWith("./")) {
            const sModulePath = "nz/co/siliconstreet/vdmdiagrammer/" + resolvedLocalSrc.substring(2);
            resolvedLocalSrc = sap.ui.require.toUrl(sModulePath);
        }

        const cacheKey = resolvedLocalSrc || cdnSrc || "";
        if (!cacheKey) return Promise.reject(new Error("No script sources provided."));
        
        if (this._scriptPromises[cacheKey]) return this._scriptPromises[cacheKey]!;
        
        const newPromise = new Promise<void>((resolve, reject) => {
            const tryLoad = (src: string, fallbackSrc?: string) => {
                if (!src) {
                    if (fallbackSrc) tryLoad(fallbackSrc);
                    else reject(new Error("Failed to load script: No valid sources available."));
                    return;
                }

                const script = document.createElement('script');
                script.src = src;
                
                script.onload = () => resolve();
                
                script.onerror = () => { 
                    script.remove(); // Clean up the dead DOM element
                    if (fallbackSrc) {
                        console.warn(`Local dependency missing: ${src}. Engaging CDN fallback...`);
                        tryLoad(fallbackSrc);
                    } else {
                        delete this._scriptPromises[cacheKey]; 
                        reject(new Error(`Failed to load dependency from all known sources. Last attempted: ${src}`)); 
                    }
                };
                
                document.head.appendChild(script);
            };

            tryLoad(resolvedLocalSrc || "", cdnSrc);
        });
        
        this._scriptPromises[cacheKey] = newPromise;
        return newPromise;
    }
}