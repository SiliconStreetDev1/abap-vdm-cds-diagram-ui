/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates OS-level HTML5 Fullscreen capabilities.
 * @description Separates native DOM fullscreen API calls and icon state management from the UI5 Controller.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Control from "sap/ui/core/Control";
import ViewStateHelper from "../helpers/ViewStateHelper";

type FullscreenElement = HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => void;
    msRequestFullscreen?: () => void;
};

type FullscreenDoc = Document & {
    fullscreenElement?: Element;
    webkitFullscreenElement?: Element;
    exitFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
    msExitFullscreen?: () => void;
};

export default class FullScreenHandler {
    private _oView: View;
    private _fnFullScreenChangeBind!: EventListener;
    private _bIsAttached: boolean = false;

    /**
     * @constructor
     * @param {View} oView - Reference to the main SAPUI5 View to access models.
     */
    constructor(oView: View) {
        this._oView = oView;
    }

    /**
     * @public
     * @description Attaches native browser event listeners to monitor fullscreen state changes.
     * @returns {void}
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;
        this._fnFullScreenChangeBind = this._onFullScreenChange.bind(this);
        document.addEventListener("fullscreenchange", this._fnFullScreenChangeBind);
        document.addEventListener("webkitfullscreenchange", this._fnFullScreenChangeBind);
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches native browser event listeners to prevent memory leaks.
     * @returns {void}
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;
        document.removeEventListener("fullscreenchange", this._fnFullScreenChangeBind);
        document.removeEventListener("webkitfullscreenchange", this._fnFullScreenChangeBind);
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Toggles OS-level HTML5 Fullscreen for a specific DOM container.
     * @param {Control | undefined} oContainer - The SAPUI5 control wrapping the canvas.
     * @returns {void}
     */
    public toggleFullScreen(oContainer: Control | undefined): void {
        if (!oContainer) return;

        const oDomRef = oContainer.getDomRef() as FullscreenElement;
        if (!oDomRef) return;

        const doc = document as FullscreenDoc;

        if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
            if (oDomRef.requestFullscreen) {
                oDomRef.requestFullscreen().catch((err: Error) => console.warn(`Fullscreen error: ${err.message}`));
            } else if (oDomRef.webkitRequestFullscreen) { 
                oDomRef.webkitRequestFullscreen();
            } else if (oDomRef.msRequestFullscreen) {
                oDomRef.msRequestFullscreen();
            }
        } else {
            if (doc.exitFullscreen) {
                const promise = doc.exitFullscreen();
                if (promise) promise.catch((err: Error) => console.warn(`Exit fullscreen error: ${err.message}`));
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
        }
    }

    /**
     * @private
     * @description Evaluates native browser fullscreen state and updates the UI5 View Model icon.
     * @returns {void}
     */
    private _onFullScreenChange(): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;

        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (!oViewModel) return;

        const doc = document as FullscreenDoc;
        const bIsFullScreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
        oViewModel.setProperty("/fullScreenIcon", bIsFullScreen ? "sap-icon://exit-full-screen" : "sap-icon://full-screen");
    }
}