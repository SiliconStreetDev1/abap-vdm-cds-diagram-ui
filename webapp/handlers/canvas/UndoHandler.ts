/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Undo (Ctrl+Z) state tracking for Cytoscape.
 * @description Option 2 implementation: State Snapshotting via Memento Pattern.
 * Safely caps memory usage to a defined stack limit.
 */
import View from "sap/ui/core/mvc/View";
import EventBus from "sap/ui/core/EventBus";
import JSONModel from "sap/ui/model/json/JSONModel";
import { DomEvents, EventChannels, EventIds } from "../../constants/EventConstants";
import { DiagramData } from "../../constants/StateConstants";
import Renderer from "../../renderer/Renderer";
import { IRenderRequestPayload } from "../../types";

export default class UndoHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _mStacks: Record<string, string[]> = {};
    private _iMaxLimit = 25;
    private _fnUndoRequestBind!: EventListener;
    private _fnStateChangeBind!: EventListener;
    private _bIsRestoring = false;
    private _bIsRestoringCache = false;
    private _iDebounceTimer?: ReturnType<typeof setTimeout>;
    private _iFailsafeTimer?: ReturnType<typeof setTimeout>;
    private _iFallbackTimer?: ReturnType<typeof setTimeout>;
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
            this._oEventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this._onRenderRequest, this);
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
            this._oEventBus.unsubscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this._onRenderRequest, this);
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
        clearTimeout(this._iFallbackTimer);
        
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Flushes the undo history stack. Called automatically whenever a completely 
     * new diagram or variant is loaded to prevent cross-contamination of layout states.
     */
    public clearHistory(): void {
        this._mStacks = {};
        this._bIsRestoring = false;
        this._bIsRestoringCache = false;
        clearTimeout(this._iDebounceTimer);
        clearTimeout(this._iFailsafeTimer);
        clearTimeout(this._iFallbackTimer);
    }

    /**
     * @private
     * @description Intercepts render requests to intelligently flush history only on brand new sessions.
     */
    private _onRenderRequest(sChannel: string, sEvent: string, rawData: Object): void {
        const oData = rawData as IRenderRequestPayload;
        if (oData && oData.engineConfig?.isRestore) {
            this._bIsRestoringCache = true;
        }
        
        // Only flush session history if it's a completely fresh root generation 
        // (Not a drill-down, and not restoring from a session cache)
        if (oData && oData.breadcrumbs && oData.breadcrumbs.length <= 1 && !oData.engineConfig?.isRestore) {
            this.clearHistory();
        } else if (oData && oData.breadcrumbs) {
            // ENTERPRISE MEMORY MANAGEMENT: Purge orphaned child stacks when navigating up
            const aValidKeys: string[] = [];
            const currentPath: string[] = [];
            oData.breadcrumbs.forEach((s: string) => {
                currentPath.push(s.toUpperCase());
                aValidKeys.push(currentPath.join('|'));
            });
            Object.keys(this._mStacks).forEach(sKey => {
                if (!aValidKeys.includes(sKey)) {
                    delete this._mStacks[sKey];
                }
            });
        }
    }

    /**
     * @private
     * @description Retrieves the active undo stack specific to the current CDS entity.
     */
    private _getStack(): string[] {
        const oDataModel = this._oView.getModel("diagramData") as JSONModel;
        if (!oDataModel) return [];
        const aLinks = oDataModel.getProperty(DiagramData.BREADCRUMB_LINKS) || [];
        const sCurrent = oDataModel.getProperty(DiagramData.CURRENT_BREADCRUMB) || oDataModel.getProperty(DiagramData.CDS_NAME) || "DEFAULT";
        const aPath = aLinks.map((l: any) => l.name).concat(sCurrent).map((s: string) => s.toUpperCase());
        const sKey = aPath.join('|');
        if (!this._mStacks[sKey]) {
            this._mStacks[sKey] = [];
        }
        return this._mStacks[sKey];
    }

    /**
     * @private
     * @description Debounces high-frequency state changes (like continuous node dragging) 
     * to ensure we only capture the final placement snapshot to conserve history steps.
     */
    private _onStateChange(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent<{ viewId: string }>;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        
        if (this._bIsRestoringCache) {
            // Defensive UX: Release the lock immediately when the canvas finishes rendering the restored cache state
            if (oCustomEvent.type === DomEvents.CANVAS_READY) {
                this._bIsRestoringCache = false;
            }
            return; // DO NOT capture state. The stack already perfectly matches this visual layout.
        }

        if (this._bIsRestoring) {
            // Defensive UX: Release the lock immediately when the canvas finishes rendering the restored state
            if (oCustomEvent.type === DomEvents.CANVAS_READY) {
                this._bIsRestoring = false;
                clearTimeout(this._iFailsafeTimer);
            }
            return;
        }
        
        // ENTERPRISE FIX: Synchronously capture the exact pristine state the millisecond the canvas is ready.
        // Bypassing the debounce timer guarantees the baseline state (State 0) is never lost 
        // if a power-user interacts with the canvas within the first 300ms.
        if (oCustomEvent.type === DomEvents.CANVAS_READY) {
            this._captureState();
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
        
        const sEngine = oDataModel.getProperty(DiagramData.ENGINE);
        if (Renderer.supportsStateCapture(sEngine)) {
            const state = Renderer.getCanvasState(this._getInstanceId(), sEngine);
            if (state) {
                const sSerializedState = JSON.stringify(state);
                const aStack = this._getStack();
                
                // Prevent pushing an identical consecutive state
                if (aStack.length > 0 && aStack[aStack.length - 1] === sSerializedState) {
                    return;
                }
                
                aStack.push(sSerializedState);
                if (aStack.length > this._iMaxLimit) {
                    aStack.shift();
                }
            }
        }
    }

    /**
     * @private
     * @description Pops the latest state off the stack and physically restores the previous layout.
     */
    private _onUndoRequest(oEvent: Event): void {
        const oCustomEvent = oEvent as CustomEvent<{ viewId: string }>;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        
        const aStack = this._getStack();

        if (aStack.length <= 1) {
            // ENTERPRISE FIX: Root Guard - Instantly drop the action if we are at the root diagram.
            const oDataModel = this._oView.getModel("diagramData") as JSONModel;
            const aBreadcrumbs = oDataModel ? oDataModel.getProperty("/breadcrumbLinks") || [] : [];
            if (aBreadcrumbs.length === 0) return;

            // ENTERPRISE UX: Stack Exhaustion Fallback
            // Wrap in an asynchronous debounce to decouple the JS Main Thread, 
            // preventing UI locks and overlapping drill-down requests if the user holds Ctrl+Z.
            if (this._iFallbackTimer) return;
            
            this._iFallbackTimer = setTimeout(() => {
                this._iFallbackTimer = undefined;
                const sParentName = aBreadcrumbs[aBreadcrumbs.length - 1].name;
                if (sParentName && this._oEventBus) {
                    this._oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.NODE_DRILL_DOWN, { viewName: sParentName });
                }
            }, 50);
            return;
        }
        
        this._bIsRestoring = true;
        aStack.pop(); // Drop the current state
        
        const sPrevState = aStack[aStack.length - 1]; // Read the new top
        const oPrevState = JSON.parse(sPrevState);
        
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const oDataModel = this._oView.getModel("diagramData") as JSONModel;
        
        if (oUiModel && oDataModel) {
            const sEngine = oDataModel.getProperty(DiagramData.ENGINE);
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