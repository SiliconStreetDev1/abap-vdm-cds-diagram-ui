/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.helpers
 * @fileoverview Utility for triggering native browser file downloads.
 * @description Abstracts raw DOM anchor injection and Blob memory revocation to uphold DRY and SRP.
 */
export default class FileDownloadUtility {
    
    /**
     * @public
     * @description Triggers a native browser download from a Data URI or Object URL.
     */
    public static downloadFromUrl(sUrl: string, sFileName: string): void {
        const link = document.createElement("a");
        link.href = sUrl;
        link.download = sFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * @public
     * @description Automatically handles Object URL mapping and memory revocation for Blob payloads.
     */
    public static downloadBlob(oBlob: Blob, sFileName: string): void {
        const url = URL.createObjectURL(oBlob);
        this.downloadFromUrl(url, sFileName);
        
        // ENTERPRISE FIX: Safari will abort downloads if the Blob URL is revoked synchronously.
        // We defer revocation by a 2-second buffer to ensure the OS file-spooler has safely acquired massive video Blobs.
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
}