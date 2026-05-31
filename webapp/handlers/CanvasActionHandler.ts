/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates Canvas interactions (Layout locking, Spacing, Minimap).
 * @description Removes direct UI5 model mutations and global DOM listeners from the Controller.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import ToggleButton from "sap/m/ToggleButton";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import SegmentedButton from "sap/m/SegmentedButton";
import EventBus from "sap/ui/core/EventBus";
import Renderer from "../renderer/Renderer";
import { EngineType } from "../types";
import { EventChannels, EventIds, DomEvents } from "../constants/EventConstants";
import ViewStateHelper from "../helpers/ViewStateHelper";

export default class CanvasActionHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _fnCloseMinimapRequestBind!: EventListener;
    private _fnLayoutUnlockedBind!: EventListener;
    private _fnVisibilityChangedBind!: EventListener;
    private _fnKeyDownBind!: EventListener;
    private _fnKeyUpBind!: EventListener;
    private _fnWindowBlurBind!: EventListener;
    private _fnFocusModeChangedBind!: EventListener;
    private _bSpaceLock: boolean = false;
    private _bWasSelectMode: boolean = false;

    constructor(oView: View, oEventBus?: EventBus) {
        this._oView = oView;
        this._oEventBus = oEventBus;
    }

    /**
     * @public
     * @description Attaches custom DOM event listeners.
     * @returns {void}
     */
    public attachEvents(): void {
        this._fnCloseMinimapRequestBind = this._onCloseMinimapRequest.bind(this) as EventListener;
        this._fnLayoutUnlockedBind = this._onLayoutUnlocked.bind(this) as EventListener;
        this._fnVisibilityChangedBind = this._onVisibilityChanged.bind(this) as EventListener;
        this._fnKeyDownBind = this._onKeyDown.bind(this) as EventListener;
        this._fnKeyUpBind = this._onKeyUp.bind(this) as EventListener;
        this._fnWindowBlurBind = this._onWindowBlur.bind(this) as EventListener;
        this._fnFocusModeChangedBind = this._onFocusModeChanged.bind(this) as EventListener;

        document.addEventListener(DomEvents.CLOSE_MINIMAP, this._fnCloseMinimapRequestBind);
        document.addEventListener(DomEvents.LAYOUT_UNLOCKED, this._fnLayoutUnlockedBind);
        document.addEventListener(DomEvents.NODES_VISIBILITY_CHANGED, this._fnVisibilityChangedBind);
        document.addEventListener("keydown", this._fnKeyDownBind);
        document.addEventListener("keyup", this._fnKeyUpBind);
        window.addEventListener("blur", this._fnWindowBlurBind);
        document.addEventListener(DomEvents.FOCUS_MODE_CHANGED, this._fnFocusModeChangedBind);
    }

    /**
     * @public
     * @description Detaches DOM event listeners.
     * @returns {void}
     */
    public detachEvents(): void {
        document.removeEventListener(DomEvents.CLOSE_MINIMAP, this._fnCloseMinimapRequestBind);
        document.removeEventListener(DomEvents.LAYOUT_UNLOCKED, this._fnLayoutUnlockedBind);
        document.removeEventListener(DomEvents.NODES_VISIBILITY_CHANGED, this._fnVisibilityChangedBind);
        document.removeEventListener("keydown", this._fnKeyDownBind);
        document.removeEventListener("keyup", this._fnKeyUpBind);
        window.removeEventListener("blur", this._fnWindowBlurBind);
        document.removeEventListener(DomEvents.FOCUS_MODE_CHANGED, this._fnFocusModeChangedBind);
    }

    /**
     * @public
     * @description Toggles global layout physics locks across all entities.
     * @param {Event} oEvent - The button press event.
     * @returns {void}
     */
    public toggleNodeLock(oEvent: Event): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const bPressed = !oViewModel.getProperty("/nodesLocked");
        oViewModel.setProperty("/nodesLocked", bPressed);
        
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        
        if (!bPressed) {
            if (oUiModel) oUiModel.setProperty("/formatCytoscape/presetPositions", null);
            MessageToast.show("Layout Unlocked");
        } else {
            const oCanvasState = Renderer.getCanvasState(sEngine);
            if (oUiModel && oCanvasState) oUiModel.setProperty("/formatCytoscape/presetPositions", oCanvasState);
            MessageToast.show("Layout Frozen");
        }
        
        Renderer.setNodesLocked(sEngine, bPressed);
    }

    /**
     * @public
     * @description Resets the canvas via an automated physics layout flow.
     * @returns {void}
     */
    public relayout(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const bIsLocked = oViewModel.getProperty("/nodesLocked");
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const bHasPresets = oUiModel && oUiModel.getProperty("/formatCytoscape/presetPositions");

        if (bIsLocked || bHasPresets) {
            MessageBox.confirm("Reset to Auto-Layout? Your custom node positions will be lost.", {
                title: "Confirm Auto-Layout",
                onClose: (sAction: string) => {
                    if (sAction === MessageBox.Action.OK) {
                        this._executeRelayout();
                    }
                }
            });
        } else {
            this._executeRelayout();
        }
    }

    /**
     * @private
     * @description Standardized execution block for layout resets.
     * @returns {void}
     */
    private _executeRelayout(): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        oViewModel.setProperty("/nodesLocked", false);
        
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/formatCytoscape/presetPositions", null);
        
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.setNodesLocked(sEngine, false);
        Renderer.runLayout(sEngine);
    }

    /**
     * @public
     * @description Disables or enables the Cytoscape minimap panel.
     * @param {Event} oEvent - The toggle button event.
     * @returns {void}
     */
    public toggleMinimap(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        (this._oView.getModel("view") as JSONModel).setProperty("/showMinimap", bPressed);
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.toggleMinimap(sEngine, bPressed);
    }

    /**
     * @public
     * @description Restores previously excluded/hidden visual nodes back to the canvas.
     * @returns {void}
     */
    public showHiddenNodes(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.showHiddenNodes(sEngine);
        (this._oView.getModel("view") as JSONModel).setProperty("/hasHiddenNodes", false);
        MessageToast.show("All hidden nodes restored");
    }

    /**
     * @public
     * @description Handles explicit user interaction mode selection from the Segmented Button.
     * @param {Event} oEvent - Standard UI5 Selection Change event.
     * @returns {void}
     */
    public changeInteractionMode(oEvent: Event): void {
        const sMode = (oEvent.getSource() as SegmentedButton).getSelectedKey();
        const bSelectMode = (sMode === "select");
        const oViewModel = this._oView.getModel("view") as JSONModel;
        oViewModel.setProperty("/isSelectMode", bSelectMode);
        
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.setInteractionMode(sEngine, bSelectMode ? "select" : "pan");
    }

    /**
     * @public
     * @description Dispatches formatting configuration parameters to the active renderer.
     * @returns {void}
     */
    public changeSpacing(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        if (oUiModel && this._oEventBus) {
            const oFormatConfig = Object.assign({}, oUiModel.getProperty("/formatCytoscape"));
            this._oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.LIVE_FORMAT_UPDATE, { engine: EngineType.CYTOSCAPE, format: oFormatConfig });
        }
    }

    /**
     * @public
     * @description Drops all active selections from the canvas.
     * @returns {void}
     */
    public clearSelection(): void {
        Renderer.clearSelection((this._oView.getModel("diagramData") as JSONModel).getProperty("/engine"));
    }

    /**
     * @private
     * @description Intercepts events requesting a teardown of the minimap control.
     * @returns {void}
     */
    private _onCloseMinimapRequest(): void {
        (this._oView.getModel("view") as JSONModel)?.setProperty("/showMinimap", false);
        Renderer.toggleMinimap((this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine"), false);
    }

    /**
     * @private
     * @description Adjusts UI logic when global layout locks are overridden locally.
     * @returns {void}
     */
    private _onLayoutUnlocked(): void {
        (this._oView.getModel("view") as JSONModel)?.setProperty("/nodesLocked", false);
        (this._oView.getModel("ui") as JSONModel)?.setProperty("/formatCytoscape/presetPositions", null);
    }

    /**
     * @private
     * @description Updates standard visual indicators dynamically based on node exposure changes.
     * @param {any} oEvent - Standard Custom DOM Event.
     * @returns {void}
     */
    private _onVisibilityChanged(oEvent: CustomEvent): void {
        const bHasHidden = oEvent.detail?.hasHidden || false;
        (this._oView.getModel("view") as JSONModel)?.setProperty("/hasHiddenNodes", bHasHidden);
    }

    /**
     * @private
     * @description Maps the Focus Mode state to the UI Model.
     * @param {CustomEvent} oEvent - Custom DOM Event.
     */
    private _onFocusModeChanged(oEvent: CustomEvent): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/isFocusMode", oEvent.detail?.isFocused || false);
            oViewModel.setProperty("/focusNodeName", oEvent.detail?.nodeName || "");
        }
    }

    /**
     * @private
     * @description Checks if the user is currently typing in an input field.
     * @param {any} target - The DOM event target.
     * @returns {boolean}
     */
    private _isInputActive(target: any): boolean {
        if (!target) return false;
        const tagName = target.tagName?.toUpperCase();
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
    }

    /**
     * @private
     * @description Toggles interaction mode when the spacebar is pressed.
     * @param {KeyboardEvent} e - Keydown event.
     * @returns {void}
     */
    private _onKeyDown(e: KeyboardEvent): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;
        
        if (e.code === "Escape") {
            this.clearSelection();
            return;
        }

        if (e.code === "Space" && !this._bSpaceLock && !this._isInputActive(e.target)) {
            e.preventDefault();
            this._bSpaceLock = true;
            
            const oViewModel = this._oView.getModel("view") as JSONModel;
            this._bWasSelectMode = oViewModel.getProperty("/isSelectMode");
            
            // Temporarily force Pan Mode while the spacebar is held down
            if (this._bWasSelectMode) {
                oViewModel.setProperty("/isSelectMode", false);
                const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
                Renderer.setInteractionMode(sEngine, "pan");
            }
        }
    }

    /**
     * @private
     * @description Releases the toggle lock when the spacebar is lifted.
     * @param {KeyboardEvent} e - Keyup event.
     * @returns {void}
     */
    private _onKeyUp(e: KeyboardEvent): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;
        
        if (e.code === "Space") {
            this._bSpaceLock = false;
            
            // Restore Select Mode the moment the user releases the spacebar
            if (this._bWasSelectMode) {
                const oViewModel = this._oView.getModel("view") as JSONModel;
                oViewModel.setProperty("/isSelectMode", true);
                const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
                Renderer.setInteractionMode(sEngine, "select");
            }
        }
    }

    /**
     * @private
     * @description Fail-safe interrupt. Instantly releases the spacebar lock if the browser window 
     * or active tab loses focus while the user is actively panning the camera.
     * @returns {void}
     */
    private _onWindowBlur(): void {
        if (this._bSpaceLock) {
            this._bSpaceLock = false;
            if (this._bWasSelectMode) {
                const oViewModel = this._oView.getModel("view") as JSONModel;
                if (oViewModel) oViewModel.setProperty("/isSelectMode", true);
                const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
                Renderer.setInteractionMode(sEngine, "select");
            }
        }
    }
}