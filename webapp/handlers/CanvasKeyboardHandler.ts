/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Keyboard Interactions (Spacebar panning, Delete, Escape, Undo).
 * @description Extracted from CanvasActionHandler to enforce SRP.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Renderer from "../renderer/Renderer";
import { DomEvents } from "../constants/EventConstants";
import ViewStateHelper from "../helpers/ViewStateHelper";

export default class CanvasKeyboardHandler {
    private _oView: View;
    private _fnKeyDownBind!: EventListener;
    private _fnKeyUpBind!: EventListener;
    private _fnWindowBlurBind!: EventListener;
    private _bSpaceLock: boolean = false;
    private _bWasSelectMode: boolean = false;
    private _bIsAttached: boolean = false;

    constructor(oView: View) {
        this._oView = oView;
    }

    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
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
        const bIsTyping = this._isInputActive(e.target);

        if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.code === "KeyZ") && !bIsTyping) {
            e.preventDefault();
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.UNDO_REQUEST, { detail: { viewId: this._getInstanceId() } }));
            return;
        }

        if (e.code === "Escape" && !bIsTyping) {
            Renderer.clearSelection(this._getInstanceId(), (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine"));
            return;
        }

        if (e.code === "Space" && !this._bSpaceLock && !bIsTyping) {
            e.preventDefault();
            this._bSpaceLock = true;
            
            const oViewModel = this._oView.getModel("view") as JSONModel;
            this._bWasSelectMode = oViewModel.getProperty("/isSelectMode");
            
            if (this._bWasSelectMode) {
                oViewModel.setProperty("/isSelectMode", false);
                const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
                Renderer.setInteractionMode(this._getInstanceId(), sEngine, "pan");
            }
        }

        if ((e.code === "Delete" || e.code === "Backspace") && !bIsTyping) {
            e.preventDefault();
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.DELETE_SELECTION_REQUEST, { detail: { viewId: this._getInstanceId() } }));
        }
    }

    private _onKeyUp(e: KeyboardEvent): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;
        
        if (e.code === "Space") {
            this._bSpaceLock = false;
            if (this._bWasSelectMode) {
                const oViewModel = this._oView.getModel("view") as JSONModel;
                oViewModel.setProperty("/isSelectMode", true);
                const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
                Renderer.setInteractionMode(this._getInstanceId(), sEngine, "select");
            }
        }
    }

    private _onWindowBlur(): void {
        if (this._bSpaceLock) {
            this._bSpaceLock = false;
            if (this._bWasSelectMode) {
                const oViewModel = this._oView.getModel("view") as JSONModel;
                if (oViewModel) oViewModel.setProperty("/isSelectMode", true);
                const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
                Renderer.setInteractionMode(this._getInstanceId(), sEngine, "select");
            }
        }
    }
}