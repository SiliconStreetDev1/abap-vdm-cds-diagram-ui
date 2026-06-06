/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Centralized Error Boundary
 * @description Intercepts raw backend OData errors, network timeouts, and JS crashes,
 * formatting them into user-friendly Fiori MessageBox dialogs.
 */
import MessageBox from "sap/m/MessageBox";

export default class ErrorHandler {

    /**
     * @public
     * @static
     * @description Processes and displays a safe error message.
     * @param {any} error - The caught error object or OData response.
     * @param {string} fallbackMessage - Default message if parsing fails.
     */
    public static handle(error: any, fallbackMessage: string = "An unexpected error occurred"): void {
        let message = fallbackMessage;

        // Ignore intentional UI cancellations from dialogs
        if (error && error.message === "CANCELLED") {
            return;
        }

        if (error && error.responseText) {
            try {
                // Try to parse SAP Gateway JSON OData Error
                const jsonError = JSON.parse(error.responseText);
                if (jsonError.error && jsonError.error.message && jsonError.error.message.value) {
                    message = jsonError.error.message.value;
                }
            } catch (e) {
                // Try to parse legacy SAP Gateway XML Error
                try {
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(error.responseText, "text/xml");
                    const messageNode = xmlDoc.getElementsByTagName("message")[0];
                    if (messageNode && messageNode.textContent) {
                        message = messageNode.textContent;
                    }
                } catch (xmlError) {
                    // Fallback to responseText string if it's plain text
                    if (typeof error.responseText === "string" && error.responseText.trim().length > 0) {
                        message = error.responseText;
                    }
                }
            }
        } else if (error && error.message) {
            // Standard JavaScript Error or parsed OData object
            message = error.message;
        }

        MessageBox.error(message, {
            title: "Error"
        });
    }
}
