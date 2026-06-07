/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates OS-level HTML5 Fullscreen capabilities.
 * @description Separates native DOM fullscreen API calls and icon state management from the UI5 Controller.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Control from "sap/ui/core/Control";
import ViewStateHelper from "../../helpers/ViewStateHelper";

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

/**
 * State Design Pattern Interface
 */
interface IFullScreenState {
    toggle(): void;
    handleChange(): void;
}

/**
 * Shared Base State encapsulating UI manipulations
 */
abstract class BaseScreenState implements IFullScreenState {
    protected _oView: View;
    protected _handler: FullScreenHandler;

    constructor(activeView: View, handler: FullScreenHandler) {
        this._oView = activeView;
        this._handler = handler;
    }

    public abstract toggle(): void;
    public abstract handleChange(): void;

    protected _setUiState(isFullScreen: boolean): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/fullScreenIcon", isFullScreen ? "sap-icon://exit-full-screen" : "sap-icon://full-screen");
            oViewModel.setProperty("/isFullScreen", isFullScreen);
        }

        const uiModel = this._oView.getModel("ui") as JSONModel;
        if (uiModel) uiModel.setProperty("/fclLayout", isFullScreen ? "MidColumnFullScreen" : "TwoColumnsMidExpanded");

        if (isFullScreen) {
            document.body.classList.add("vdm-fullscreen-active");
            if (!document.getElementById("vdm-fullscreen-styles")) {
                const style = document.createElement("style");
                style.id = "vdm-fullscreen-styles";
                style.innerHTML = `
                    body.vdm-fullscreen-active { overflow: hidden !important; }
                    body.vdm-fullscreen-active #shell-hdr { display: none !important; }
                    body.vdm-fullscreen-active .sapUshellShellHeader { display: none !important; }
                `;
                document.head.appendChild(style);
            }
        } else {
            document.body.classList.remove("vdm-fullscreen-active");
        }
    }
}

/**
 * Concrete State: Normal Windowed Mode
 */
class NormalScreenState extends BaseScreenState {
    /**
     * @public
     * @description Executes toggle functionality.
     */
    public toggle(): void {
        const target = document.documentElement as FullscreenElement;
        if (!target) return;

        if (target.requestFullscreen) {
            target.requestFullscreen().catch((err: Error) => console.warn(`Fullscreen error: ${err.message}`));
        } else if (target.webkitRequestFullscreen) { 
            target.webkitRequestFullscreen();
        } else if (target.msRequestFullscreen) {
            target.msRequestFullscreen();
        }
    }

    /**
     * @public
     * @description Executes handleChange functionality.
     */
    public handleChange(): void {
        const doc = document as FullscreenDoc;
        const isFullScreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
        if (isFullScreen) {
            this._setUiState(true);
            this._handler.setState(new FullScreenActiveState(this._oView, this._handler));
        }
    }
}

/**
 * Concrete State: Active Fullscreen Mode
 */
class FullScreenActiveState extends BaseScreenState {
    /**
     * @public
     * @description Executes toggle functionality.
     */
    public toggle(): void {
        const doc = document as FullscreenDoc;
        if (doc.exitFullscreen) {
            const promise = doc.exitFullscreen();
            if (promise) promise.catch((err: Error) => console.warn(`Exit fullscreen error: ${err.message}`));
        } else if (doc.webkitExitFullscreen) {
            doc.webkitExitFullscreen();
        } else if (doc.msExitFullscreen) {
            doc.msExitFullscreen();
        }
    }

    /**
     * @public
     * @description Executes handleChange functionality.
     */
    public handleChange(): void {
        const doc = document as FullscreenDoc;
        const isFullScreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
        if (!isFullScreen) {
            this._setUiState(false);
            this._handler.setState(new NormalScreenState(this._oView, this._handler));
        }
    }
}

export default class FullScreenHandler {
    private _oView: View;
    private _activeState: IFullScreenState;
    private _fnFullScreenChangeBind!: EventListener;
    private _bIsAttached: boolean = false;

    /**
     * @constructor
     * @param {View} activeView - Reference to the main SAPUI5 View to access models.
     */
    constructor(activeView: View) {
        this._oView = activeView;
        this._activeState = new NormalScreenState(activeView, this);
    }

    /**
     * @public
     * @description Executes setState functionality.
     */
    public setState(state: IFullScreenState): void {
        this._activeState = state;
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
        this._activeState.toggle();
    }

    /**
     * @private
     * @returns {void}
     */
    private _onFullScreenChange(): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;
        this._activeState.handleChange();
    }
}