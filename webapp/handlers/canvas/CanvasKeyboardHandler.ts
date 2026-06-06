/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers.canvas
 * @fileoverview Manages DOM Event bindings for Keyboard Interactions.
 * @description Acts as a polymorphic Context Manager, delegating key mappings 
 * dynamically to the active Viewer or Builder strategy.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ViewStateHelper from "../../helpers/ViewStateHelper";
import { UiState, ViewState, ModelNames } from "../../constants/StateConstants";
import BaseKeyboardStrategy from "../keyboard/BaseKeyboardStrategy";
import BuilderKeyboardStrategy from "../keyboard/BuilderKeyboardStrategy";
import ViewerKeyboardStrategy from "../keyboard/ViewerKeyboardStrategy";
import { EventManager } from "../../events/EventManager";

export default class CanvasKeyboardHandler {
    private _oView: View;
    private _fnKeyDownBind!: EventListener;
    private _fnKeyUpBind!: EventListener;
    private _fnWindowBlurBind!: EventListener;
    private _bSpaceLock: boolean = false;
    private _bShiftLock: boolean = false;
    private _bWasSelectMode: boolean = false;
    private _bWasPanMode: boolean = false;
    private _bIsAttached: boolean = false;

    private _builderStrategy: BuilderKeyboardStrategy;
    private _viewerStrategy: ViewerKeyboardStrategy;

    constructor(oView: View) {
        this._oView = oView;
        this._builderStrategy = new BuilderKeyboardStrategy(oView);
        this._viewerStrategy = new ViewerKeyboardStrategy(oView);
    }

    private _getActiveStrategy(): BaseKeyboardStrategy {
        const oUiModel = this._oView.getModel(ModelNames.UI) as JSONModel;
        const isViewer = oUiModel ? oUiModel.getProperty(UiState.IS_VIEWER_MODE) : false;
        return isViewer ? this._viewerStrategy : this._builderStrategy;
    }

    public attachEvents(): void {
        if (this._bIsAttached) return;
        this._fnKeyDownBind = this._onKeyDown.bind(this) as EventListener;
        this._fnKeyUpBind = this._onKeyUp.bind(this) as EventListener;
        this._fnWindowBlurBind = this._onWindowBlur.bind(this) as EventListener;

        document.addEventListener("keydown", this._fnKeyDownBind);
        document.addEventListener("keyup", this._fnKeyUpBind);
        window.addEventListener("blur", this._fnWindowBlurBind);
        this._bIsAttached = true;
    }

    public detachEvents(): void {
        if (!this._bIsAttached) return;
        document.removeEventListener("keydown", this._fnKeyDownBind);
        document.removeEventListener("keyup", this._fnKeyUpBind);
        window.removeEventListener("blur", this._fnWindowBlurBind);
        this._bIsAttached = false;
    }

    private _isInputActive(target: EventTarget | null): boolean {
        if (!target) return false;
        const element = target as HTMLElement;
        const tagName = element.tagName?.toUpperCase();
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable;
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;

        const oUiModel = this._oView.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel && oUiModel.getProperty(UiState.IS_FETCHING)) return;

        const bCtrl = e.ctrlKey || e.metaKey;
        const bShift = e.shiftKey;
        const sKey = e.key ? e.key.toLowerCase() : "";

        // Global Stealth Record Hotkey (Bypasses Typing Guards)
        if (bCtrl && bShift && sKey === "x") {
            e.preventDefault();
            EventManager.getInstance().publish("video:toggleStealth", undefined);
            return;
        }

        const bIsTyping = this._isInputActive(e.target);

        // Handle Temporary Modifier Holds (Space for Pan, Shift for Box Select) safely
        if (!bIsTyping) {
            if ((e.key === " " || e.code === "Space") && !this._bSpaceLock) {
                e.preventDefault();
                this._bSpaceLock = true;
                this._bWasSelectMode = (this._oView.getModel(ModelNames.VIEW) as JSONModel).getProperty(ViewState.IS_SELECT_MODE);
                if (this._bWasSelectMode) this._getActiveStrategy().setMode("pan");
                return;
            }

            if ((e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") && !this._bShiftLock) {
                this._bShiftLock = true;
                this._bWasPanMode = !(this._oView.getModel(ModelNames.VIEW) as JSONModel).getProperty(ViewState.IS_SELECT_MODE);
                if (this._bWasPanMode) this._getActiveStrategy().setMode("select");
                return;
            }
        }

        // Delegate execution down to the active Strategy constraint
        this._getActiveStrategy().mapShortcuts(e, bIsTyping);
    }

    private _onKeyUp(e: KeyboardEvent): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;
        
        const oUiModel = this._oView.getModel(ModelNames.UI) as JSONModel;
        if (oUiModel && oUiModel.getProperty(UiState.IS_FETCHING)) return;
        
        if ((e.key === " " || e.code === "Space") && this._bSpaceLock) {
            this._bSpaceLock = false;
            if (this._bWasSelectMode) {
                this._getActiveStrategy().setMode("select");
            }
        }

        if ((e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") && this._bShiftLock) {
            this._bShiftLock = false;
            if (this._bWasPanMode) {
                this._getActiveStrategy().setMode("pan");
            }
        }
    }

    private _onWindowBlur(): void {
        if (this._bSpaceLock) {
            this._bSpaceLock = false;
            if (this._bWasSelectMode) {
                this._getActiveStrategy().setMode("select");
            }
        }
        if (this._bShiftLock) {
            this._bShiftLock = false;
            if (this._bWasPanMode) {
                this._getActiveStrategy().setMode("pan");
            }
        }
    }
}
