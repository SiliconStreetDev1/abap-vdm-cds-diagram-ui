/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Keyboard Interactions (Spacebar panning, Delete, Escape, Undo).
 * @description Extracted from CanvasActionHandler to enforce SRP.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import EventBus from "sap/ui/core/EventBus";
import Renderer from "../renderer/Renderer";
import { DomEvents, EventChannels, EventIds } from "../constants/EventConstants";
import ViewStateHelper from "../helpers/ViewStateHelper";

export default class CanvasKeyboardHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _fnKeyDownBind!: EventListener;
    private _fnKeyUpBind!: EventListener;
    private _fnWindowBlurBind!: EventListener;
    private _bSpaceLock: boolean = false;
    private _bShiftLock: boolean = false;
    private _bWasSelectMode: boolean = false;
    private _bWasPanMode: boolean = false;
    private _bIsAttached: boolean = false;

    constructor(oView: View, oEventBus?: EventBus) {
        this._oView = oView;
        this._oEventBus = oEventBus;
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

        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel && oUiModel.getProperty("/isFetching")) return;

        const bIsTyping = this._isInputActive(e.target);

        // Handle Temporary Modifier Holds (Space for Pan, Shift for Box Select) safely
        if (!bIsTyping) {
            if ((e.key === " " || e.code === "Space") && !this._bSpaceLock) {
                e.preventDefault();
                this._bSpaceLock = true;
                this._bWasSelectMode = (this._oView.getModel("view") as JSONModel).getProperty("/isSelectMode");
                if (this._bWasSelectMode) this._setMode("pan");
                return;
            }

            if ((e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") && !this._bShiftLock) {
                this._bShiftLock = true;
                this._bWasPanMode = !(this._oView.getModel("view") as JSONModel).getProperty("/isSelectMode");
                if (this._bWasPanMode) this._setMode("select");
                return;
            }
        }

        // Centralized Mapping Block
        this._mapShortcuts(e, bIsTyping);
    }

    /**
     * @private
     * @description The Single Source of Truth for all explicit key bindings.
     */
    private _mapShortcuts(e: KeyboardEvent, bIsTyping: boolean): void {
        const bCtrl = e.ctrlKey || e.metaKey;
        const bShift = e.shiftKey;
        const sKey = e.key ? e.key.toLowerCase() : "";
        const sRawKey = e.key || "";

        // ========================================================================
        // 1. GLOBAL HOTKEYS (Bypasses Typing Guards)
        // ========================================================================
        if (bCtrl && bShift && sKey === "x") {
            e.preventDefault();
            if (this._oEventBus) this._oEventBus.publish(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_TOGGLE_STEALTH);
            return;
        }

        // If user is inside an input field, halt all canvas-specific shortcuts
        if (bIsTyping) return;

        // ========================================================================
        // 2. MODIFIER: CTRL / CMD
        // ========================================================================
        if (bCtrl && !bShift && !e.altKey) {
            if (sKey === "z") { e.preventDefault(); this._dispatch(DomEvents.UNDO_REQUEST); return; }
            if (sKey === "a") { e.preventDefault(); this._selectAll(); return; }
        }

        // ========================================================================
        // 3. MODIFIER: SHIFT (Toolbar Actions)
        // ========================================================================
        if (bShift && !bCtrl && !e.altKey) {
            if (sKey === "n") { e.preventDefault(); this._addNote(); return; }
            if (sKey === "h") { e.preventDefault(); this._toggleHidden(); return; }
            if (sKey === "m") { e.preventDefault(); this._toggleMinimap(); return; }
            if (sKey === "t") { e.preventDefault(); this._toggleTempFocus(); return; }
        }

        // ========================================================================
        // 4. BASE KEYS (Tools & Actions)
        // ========================================================================
        if (!bCtrl && !bShift && !e.altKey) {
            if (sKey === "s" || sKey === "v") { e.preventDefault(); this._setMode("select"); return; }
            if (sKey === "p" || sKey === "h") { e.preventDefault(); this._setMode("pan"); return; }
            if (sRawKey === "Escape") { this._clearSelection(); return; }
            if (sRawKey === "Delete" || sRawKey === "Backspace") { e.preventDefault(); this._deleteSelection(); return; }
        }
    }

    private _onKeyUp(e: KeyboardEvent): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;
        
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel && oUiModel.getProperty("/isFetching")) return;
        
        if (e.key === " " || e.code === "Space") {
            this._bSpaceLock = false;
            if (this._bWasSelectMode) {
                this._setMode("select");
            }
        }

        if (e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight") {
            this._bShiftLock = false;
            if (this._bWasPanMode) {
                this._setMode("pan");
            }
        }
    }

    private _onWindowBlur(): void {
        if (this._bSpaceLock) {
            this._bSpaceLock = false;
            if (this._bWasSelectMode) {
                this._setMode("select");
            }
        }
        if (this._bShiftLock) {
            this._bShiftLock = false;
            if (this._bWasPanMode) {
                this._setMode("pan");
            }
        }
    }

    // ========================================================================
    // DELEGATION HELPERS
    // ========================================================================

    private _setMode(sMode: "pan" | "select"): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty("/isSelectMode", sMode === "select");
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine");
        Renderer.setInteractionMode(this._getInstanceId(), sEngine, sMode);
    }

    private _dispatch(sEventId: string): void {
        if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(sEventId, { detail: { viewId: this._getInstanceId() } }));
    }

    private _selectAll(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine");
        Renderer.selectAll(this._getInstanceId(), sEngine);
    }

    private _addNote(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && !oViewModel.getProperty("/isDrillDown")) this._dispatch(DomEvents.PROMPT_ADD_NOTE_REQUEST);
    }

    private _toggleHidden(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty("/hasHiddenNodes")) {
            const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
            if (oDialog) oDialog.open();
        }
    }

    private _toggleMinimap(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oViewModel.getProperty("/hasDiagram") && oViewModel.getProperty("/canShowMinimap")) {
            const bShow = !oViewModel.getProperty("/showMinimap");
            oViewModel.setProperty("/showMinimap", bShow);
            const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine");
            Renderer.toggleMinimap(this._getInstanceId(), sEngine, bShow);
        }
    }

    private _toggleTempFocus(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel && oUiModel && oViewModel.getProperty("/hasNodeSelected") && !oUiModel.getProperty("/formatCytoscape/enableFocusMode")) {
            const bCurrentFocus = oViewModel.getProperty("/tempFocusMode");
            oViewModel.setProperty("/tempFocusMode", !bCurrentFocus);
            const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine");
            Renderer.setTempFocusMode(this._getInstanceId(), sEngine, !bCurrentFocus);
        }
    }

    private _clearSelection(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine");
        Renderer.clearSelection(this._getInstanceId(), sEngine);
    }

    private _deleteSelection(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine");
        Renderer.deleteSelection(this._getInstanceId(), sEngine);
        this._dispatch(DomEvents.DELETE_SELECTION_REQUEST);
    }
}