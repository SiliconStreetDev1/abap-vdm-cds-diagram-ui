/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.services
 * @fileoverview Deep Link Service.
 * @description Isolates cross-application URL generation logic.
 */
/**
 * @class DeepLinkService
 * @description Stateless utility service for handling cross-application navigation routing and deep-linking URLs.
 */
export default class DeepLinkService {
    /**
     * @public
     * @static
     * @description Generates a standardized Fiori-compliant shareable URL using CrossApplicationNavigation.
     * Falls back to manual hash manipulation strictly for standalone sandbox environments.
     * @param {string} variantId - The backend UUID of the target variant.
     * @returns {Promise<string>} The absolute URL to the viewer deep link.
     */
    public static async generateShareUrl(variantId: string): Promise<string> {
        const baseUrl = window.location.href.split('#')[0];
        let shareHash = "";

        try {
            if (typeof sap !== "undefined" && sap.ushell && (sap.ushell as any).Container) {
                const crossAppNav = await (sap.ushell as any).Container.getServiceAsync("CrossApplicationNavigation");
                let currentHash = window.location.hash;
                if (currentHash.startsWith("#")) currentHash = currentHash.substring(1);
                
                const parsed = crossAppNav.parseShellHash(currentHash);
                if (parsed && parsed.semanticObject && parsed.action) {
                    shareHash = crossAppNav.hrefForExternal({
                        target: { semanticObject: parsed.semanticObject, action: parsed.action },
                        appSpecificRoute: `&/viewer/${variantId}`
                    }) || "";
                }
            }
        } catch (error) {}

        if (!shareHash) {
            let baseHash = window.location.hash.split('?')[0]; 
            if (baseHash.includes('&/')) baseHash = baseHash.split('&/')[0];
            else if (baseHash.includes('/')) baseHash = baseHash.split('/')[0];
            if (!baseHash || baseHash === "#") baseHash = "#VDMDiagram-display"; 
            
            const separator = baseHash.includes("-") ? "&/" : "/";
            shareHash = `${baseHash}${separator}viewer/${variantId}`;
        }
        return shareHash.startsWith("#") ? `${baseUrl}${shareHash}` : `${baseUrl}#${shareHash}`;
    }
}