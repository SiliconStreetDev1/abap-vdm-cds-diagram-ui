/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Undo (Ctrl+Z) state tracking for Cytoscape.
 * @description Option 2 implementation: State Snapshotting via Memento Pattern.
 * Safely caps memory usage to a defined stack limit.
 */
import View from "sap/ui/core/mvc/View";
import EventBus from "sap/ui/core/EventBus";
import JSONModel from "sap/ui/model/json/JSONModel";
import { DomEvents, EventChannels, EventIds } from "../constants/EventConstants";
import Renderer from "../renderer/Renderer";

export default class UndoHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _aStack: string[] = [];
    private _iMaxLimit = 15;
    private _fnUndoRequestBind!: EventListener;
    private _fnStateChangeBind!: EventListener;
    private _bIsRestoring = false;
    private _iDebounceTimer?: ReturnType<typeof setTimeout>;
    private _iFailsafeTimer?: ReturnType<typeof setTimeout>;
    private _bIsAttached: boolean = false;

    /**
     * @public
     * @param {View} oView - The active UI5 View.
     * @param {EventBus} [oEventBus] - Application event bus.
     */
    constructor(oView: View, oEventBus?: EventBus) {
        this._oView = oView;
        this._oEventBus = oEventBus;
    }

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private _getInstanceId(): string {
        return this._oView.getController()?.getOwnerComponent()?.getId() || this._oView.getId();
    }

    /**
     * @public
     * @description Attaches custom DOM event listeners for undo and state changes.
     * @returns {void}
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;

        this._fnUndoRequestBind = this._onUndoRequest.bind(this) as EventListener;
        this._fnStateChangeBind = this._onStateChange.bind(this) as EventListener;
        
        if (this._oEventBus) {
            this._oEventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this.clearHistory, this);
        }

        if (typeof document !== "undefined") {
            document.addEventListener(DomEvents.UNDO_REQUEST, this._fnUndoRequestBind);
            
            document.addEventListener(DomEvents.NODE_DRAGGED, this._fnStateChangeBind);
            document.addEventListener(DomEvents.NODE_PINNED, this._fnStateChangeBind);
            document.addEventListener(DomEvents.NODE_HIDDEN, this._fnStateChangeBind);
            document.addEventListener(DomEvents.NODE_UNHIDDEN, this._fnStateChangeBind);
            document.addEventListener(DomEvents.CANVAS_READY, this._fnStateChangeBind);
            document.addEventListener(DomEvents.ADD_NOTE_REQUEST, this._fnStateChangeBind);
            document.addEventListener(DomEvents.EDIT_NOTE_REQUEST, this._fnStateChangeBind);
            document.addEventListener(DomEvents.CHANGE_NOTE_COLOR_REQUEST, this._fnStateChangeBind);
        }
        
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches custom DOM event listeners to prevent memory leaks.
     * @returns {void}
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;

        if (this._oEventBus) {
            this._oEventBus.unsubscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this.clearHistory, this);
        }
        
        if (typeof document !== "undefined") {
            document.removeEventListener(DomEvents.UNDO_REQUEST, this._fnUndoRequestBind);
            document.removeEventListener(DomEvents.NODE_DRAGGED, this._fnStateChangeBind);
            document.removeEventListener(DomEvents.NODE_PINNED, this._fnStateChangeBind);
            document.removeEventListener(DomEvents.NODE_HIDDEN, this._fnStateChangeBind);
            document.removeEventListener(DomEvents.NODE_UNHIDDEN, this._fnStateChangeBind);
            document.removeEventListener(DomEvents.CANVAS_READY, this._fnStateChangeBind);
            document.removeEventListener(DomEvents.ADD_NOTE_REQUEST, this._fnStateChangeBind);
            document.removeEventListener(DomEvents.EDIT_NOTE_REQUEST, this._fnStateChangeBind);
            document.removeEventListener(DomEvents.CHANGE_NOTE_COLOR_REQUEST, this._fnStateChangeBind);
        }
        clearTimeout(this._iDebounceTimer);
        clearTimeout(this._iFailsafeTimer); // ENTERPRISE FIX: Clear dangling failsafe timer
        
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Flushes the undo history stack. Called automatically whenever a completely 
     * new diagram or variant is loaded to prevent cross-contamination of layout states.
     */
    public clearHistory(): void {
        this._aStack = [];
        this._bIsRestoring = false;
        clearTimeout(this._iDebounceTimer);
        clearTimeout(this._iFailsafeTimer);
    }

    /**
     * @private
     * @description Debounces high-frequency state changes (like continuous node dragging) 
     * to ensure we only capture the final placement snapshot to conserve history steps.
     */
    private _onStateChange(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        if (this._bIsRestoring) {
            // Defensive UX: Release the lock immediately when the canvas finishes rendering the restored state
            if (oCustomEvent.type === DomEvents.CANVAS_READY) {
                this._bIsRestoring = false;
                clearTimeout(this._iFailsafeTimer);
            }
            return;
        }
        
        clearTimeout(this._iDebounceTimer);
        this._iDebounceTimer = setTimeout(() => {
            this._captureState();
        }, 300);
    }

    /**
     * @private
     * @description Captures the current canvas layout and metadata into the history stack.
     */
    private _captureState(): void {
        const oDataModel = this._oView.getModel("diagramData") as JSONModel;
        if (!oDataModel) return;
        
        const sEngine = oDataModel.getProperty("/engine");
        if (Renderer.supportsStateCapture(sEngine)) {
            const state = Renderer.getCanvasState(this._getInstanceId(), sEngine);
            if (state) {
                const sSerializedState = JSON.stringify(state);
                
                // Prevent pushing an identical consecutive state
                if (this._aStack.length > 0 && this._aStack[this._aStack.length - 1] === sSerializedState) {
                    return;
                }
                
                this._aStack.push(sSerializedState);
                if (this._aStack.length > this._iMaxLimit) {
                    this._aStack.shift();
                }
            }
        }
    }

    /**
     * @private
     * @description Pops the latest state off the stack and physically restores the previous layout.
     */
    private _onUndoRequest(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        if (this._aStack.length <= 1) return;
        
        this._bIsRestoring = true;
        this._aStack.pop(); // Drop the current state
        
        const sPrevState = this._aStack[this._aStack.length - 1]; // Read the new top
        const oPrevState = JSON.parse(sPrevState);
        
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const oDataModel = this._oView.getModel("diagramData") as JSONModel;
        
        if (oUiModel && oDataModel) {
            const sEngine = oDataModel.getProperty("/engine");
            if (Renderer.supportsStateCapture(sEngine)) {
                const oModelData = oUiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
                if (sFormatKey) {
                    let oFormat = Object.assign({}, oUiModel.getProperty(`/${sFormatKey}`));
                    oFormat = Renderer.applyStateToConfig(sEngine, oFormat, oPrevState);
                    oUiModel.setProperty(`/${sFormatKey}`, oFormat);
                    Renderer.updateLiveFormat(this._getInstanceId(), sEngine, oFormat);
                }
            }
        }
        
        // Failsafe lock release in case CANVAS_READY fails to fire
        clearTimeout(this._iFailsafeTimer);
        this._iFailsafeTimer = setTimeout(() => {
            this._bIsRestoring = false;
        }, 500);
    }
}