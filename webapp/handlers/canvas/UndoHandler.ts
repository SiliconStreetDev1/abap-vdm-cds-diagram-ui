/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages Undo (Ctrl+Z) state tracking for Cytoscape.
 * @description Option 2 implementation: State Snapshotting via Memento Pattern.
 * Safely caps memory usage to a defined stack limit.
 */
import View from "sap/ui/core/mvc/View";
import { EventManager } from "../../events/EventManager";
import { Subscription } from "../../events/Subscription";
import JSONModel from "sap/ui/model/json/JSONModel";
import { DiagramData } from "../../constants/StateConstants";
import Renderer from "../../renderer/Renderer";
import { IRenderRequestPayload } from "../../types";

export default class UndoHandler {
    private _oView: View;
    private _subscriptions: Subscription[] = [];
    private _mStacks: Record<string, string[]> = {};
    private _iMaxLimit = 25;
    private _fnUndoRequestBind!: any;
    private _fnStateChangeBind!: any;
    private _bIsRestoring = false;
    private _bIsRestoringCache = false;
    private _iDebounceTimer?: ReturnType<typeof setTimeout>;
    private _iFailsafeTimer?: ReturnType<typeof setTimeout>;
    private _iFallbackTimer?: ReturnType<typeof setTimeout>;
    private _bIsAttached: boolean = false;

    /**
     * @public
     * @param {View} oView - The active UI5 View.
     */
    constructor(oView: View) {
        this._oView = oView;
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

        this._fnUndoRequestBind = this._onUndoRequest.bind(this) as any;
        this._fnStateChangeBind = this._onStateChange.bind(this) as any;
        
        this._subscriptions.push(EventManager.getInstance().subscribe("diagram:renderRequest", this._onRenderRequest.bind(this)));

        if (typeof document !== "undefined") {
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:undoRequest", this._fnUndoRequestBind));
            
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodeDragged", this._fnStateChangeBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodePinned", this._fnStateChangeBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodeHidden", this._fnStateChangeBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:nodeUnhidden", this._fnStateChangeBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:ready", this._fnStateChangeBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:addNoteRequest", this._fnStateChangeBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:editNoteRequest", this._fnStateChangeBind));
            this._subscriptions.push(EventManager.getInstance().subscribe("canvas:changeNoteColorRequest", this._fnStateChangeBind));
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

        this._subscriptions.forEach(sub => sub.dispose());
        this._subscriptions = [];
        
        if (typeof document !== "undefined") {
            /* removed */
            /* removed */
            /* removed */
            /* removed */
            /* removed */
            /* removed */
            /* removed */
            /* removed */
            /* removed */
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
    private _onRenderRequest(rawData: Object): void {
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
        const payload = oEvent as any;
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        
        if (this._bIsRestoringCache) {
            // Defensive UX: Release the lock immediately when the canvas finishes rendering the restored cache state
            if ((payload as any)._syntheticType === "canvas:ready") {
                this._bIsRestoringCache = false;
            }
            return; // DO NOT capture state. The stack already perfectly matches this visual layout.
        }

        if (this._bIsRestoring) {
            // Defensive UX: Release the lock immediately when the canvas finishes rendering the restored state
            if ((payload as any)._syntheticType === "canvas:ready") {
                this._bIsRestoring = false;
                clearTimeout(this._iFailsafeTimer);
            }
            return;
        }
        
        // ENTERPRISE FIX: Synchronously capture the exact pristine state the millisecond the canvas is ready.
        // Bypassing the debounce timer guarantees the baseline state (State 0) is never lost 
        // if a power-user interacts with the canvas within the first 300ms.
        if ((payload as any)._syntheticType === "canvas:ready") {
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
        const payload = oEvent as any;
        if (payload?.viewId && payload?.viewId !== this._getInstanceId()) return;
        
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
                if (sParentName) {
                    EventManager.getInstance().publish("diagram:nodeDrillDown", { viewName: sParentName });
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