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
import List from "sap/m/List";
import Dialog from "sap/m/Dialog";
import ResponsivePopover from "sap/m/ResponsivePopover";
import Slider from "sap/m/Slider";
import Control from "sap/ui/core/Control";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Context from "sap/ui/model/Context";
import Renderer from "../renderer/Renderer";
import { EngineType } from "../types";
import { EventChannels, EventIds, DomEvents } from "../constants/EventConstants";
import ViewStateHelper from "../helpers/ViewStateHelper";

export default class CanvasActionHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _fnCloseMinimapRequestBind!: EventListener;
    private _fnVisibilityChangedBind!: EventListener;
    private _fnKeyDownBind!: EventListener;
    private _fnKeyUpBind!: EventListener;
    private _fnWindowBlurBind!: EventListener;
    private _fnFocusModeChangedBind!: EventListener;
    private _bSpaceLock: boolean = false;
    private _bWasSelectMode: boolean = false;
    private _oSpacingPopover?: ResponsivePopover;

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
     * @description Attaches custom DOM event listeners.
     * @returns {void}
     */
    public attachEvents(): void {
        this._fnCloseMinimapRequestBind = this._onCloseMinimapRequest.bind(this) as EventListener;
        this._fnVisibilityChangedBind = this._onVisibilityChanged.bind(this) as EventListener;
        this._fnKeyDownBind = this._onKeyDown.bind(this) as EventListener;
        this._fnKeyUpBind = this._onKeyUp.bind(this) as EventListener;
        this._fnWindowBlurBind = this._onWindowBlur.bind(this) as EventListener;
        this._fnFocusModeChangedBind = this._onFocusModeChanged.bind(this) as EventListener;

        document.addEventListener(DomEvents.CLOSE_MINIMAP, this._fnCloseMinimapRequestBind);
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
        document.removeEventListener(DomEvents.NODES_VISIBILITY_CHANGED, this._fnVisibilityChangedBind);
        document.removeEventListener("keydown", this._fnKeyDownBind);
        document.removeEventListener("keyup", this._fnKeyUpBind);
        window.removeEventListener("blur", this._fnWindowBlurBind);
        document.removeEventListener(DomEvents.FOCUS_MODE_CHANGED, this._fnFocusModeChangedBind);
        if (this._oSpacingPopover) {
            this._oSpacingPopover.destroy();
            this._oSpacingPopover = undefined;
        }
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
        Renderer.toggleMinimap(this._getInstanceId(), sEngine, bPressed);
    }

    /**
     * @public
     * @description Opens the hidden nodes dialog.
     * @returns {void}
     */
    public openHiddenNodesDialog(): void {
        const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.open();
    }

    /**
     * @public
     * @description Closes the hidden nodes dialog.
     * @returns {void}
     */
    public closeHiddenNodesDialog(): void {
        const oDialog = this._oView.byId("popHiddenNodes") as Dialog;
        if (oDialog) oDialog.close();
    }

    /**
     * @public
     * @description Restores previously excluded/hidden visual nodes back to the canvas.
     * @returns {void}
     */
    public showHiddenNodes(): void {
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.showHiddenNodes(this._getInstanceId(), sEngine);
        (this._oView.getModel("view") as JSONModel).setProperty("/hasHiddenNodes", false);
        MessageToast.show("All hidden nodes restored");
        this.closeHiddenNodesDialog();
        (this._oView.byId("listHiddenNodes") as List)?.removeSelections(true);
    }

    /**
     * @public
     * @description Restores specifically selected nodes from the hidden list.
     * @returns {void}
     */
    public restoreSelectedNodes(): void {
        const oList = this._oView.byId("listHiddenNodes") as List;
        if (!oList) return;
        const aSelectedContexts = oList.getSelectedContexts();
        if (aSelectedContexts.length === 0) {
            MessageToast.show("No entities selected");
            return;
        }
        
        const aIds = aSelectedContexts.map((oCtx: Context) => oCtx.getProperty("id"));
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        
        Renderer.showSpecificNodes(this._getInstanceId(), sEngine, aIds);
        
        oList.removeSelections(true);
        
        const oViewModel = this._oView.getModel("view") as JSONModel;
        const aRemaining = oViewModel.getProperty("/hiddenNodesList") || [];
        if (aRemaining.length <= aIds.length) {
            this.closeHiddenNodesDialog();
        }
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
        Renderer.setInteractionMode(this._getInstanceId(), sEngine, bSelectMode ? "select" : "pan");
    }

    /**
     * @public
     * @description Dispatches formatting configuration parameters to the active renderer.
     * @returns {void}
     */
    public changeSpacing(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        
        if (oUiModel && this._oEventBus && Renderer.supportsLiveUpdate(sEngine)) {
            const oModelData = oUiModel.getData();
            const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
            if (sFormatKey) {
                const oFormatConfig = Object.assign({}, oUiModel.getProperty(`/${sFormatKey}`));
                this._oEventBus.publish(EventChannels.DIAGRAM_ENGINE, EventIds.LIVE_FORMAT_UPDATE, { engine: sEngine, format: oFormatConfig });
                
                if (typeof document !== "undefined") {
                    document.dispatchEvent(new CustomEvent(DomEvents.FORMAT_SLIDER_UPDATE, { detail: { viewId: this._getInstanceId(), node_spacing: oFormatConfig.node_spacing } }));
                }
            }
        }
    }

    /**
     * @public
     * @description Displays the Node Spacing slider in a localized Fiori Popover.
     * @param {Event} oEvent - Button press event.
     * @returns {void}
     */
    public showSpacingPopover(oEvent: Event): void {
        if (!this._oSpacingPopover) {
            this._oSpacingPopover = new ResponsivePopover({
                showHeader: false,
                placement: "Top",
                contentWidth: "300px",
                verticalScrolling: false,
                horizontalScrolling: false,
                content: [
                    new Slider({ 
                        width: "260px",
                        value: "{ui>/formatCytoscape/node_spacing}", 
                        min: 50, max: 250, step: 25, enableTickmarks: true, 
                        change: this.changeSpacing.bind(this),
                        enabled: "{= ${ui>/formatCytoscape/layout_algorithm} !== 'preset' }"
                    }).addStyleClass("sapUiSmallMargin")
                ]
            });
            this._oView.addDependent(this._oSpacingPopover);
        }
        this._oSpacingPopover.openBy(oEvent.getSource() as Control);
    }

    /**
     * @public
     * @description Search handler for locating specific nodes in the active canvas.
     */
    public searchCanvas(oEvent: SearchField$SearchEvent): void {
        const sQuery = oEvent.getParameter("query") || "";
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine");
        Renderer.searchCanvas(this._getInstanceId(), sEngine, sQuery);
    }

    /**
     * @public
     * @description Drops all active selections from the canvas.
     * @returns {void}
     */
    public clearSelection(): void {
        Renderer.clearSelection(this._getInstanceId(), (this._oView.getModel("diagramData") as JSONModel).getProperty("/engine"));
    }

    /**
     * @private
     * @description Intercepts events requesting a teardown of the minimap control.
     * @returns {void}
     */
    private _onCloseMinimapRequest(oEvent: globalThis.Event): void {
        const oCustomEvent = oEvent as unknown as CustomEvent;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        (this._oView.getModel("view") as JSONModel)?.setProperty("/showMinimap", false);
        Renderer.toggleMinimap(this._getInstanceId(), (this._oView.getModel("diagramData") as JSONModel)?.getProperty("/engine"), false);
    }

    /**
     * @private
     * @description Updates standard visual indicators dynamically based on node exposure changes.
     * @param {any} oEvent - Standard Custom DOM Event.
     * @returns {void}
     */
    private _onVisibilityChanged(oEvent: globalThis.Event): void {
        const oCustomEvent = oEvent as unknown as CustomEvent;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        const bHasHidden = oCustomEvent.detail?.hasHidden || false;
        const aHiddenNodes = oCustomEvent.detail?.hiddenNodes || [];
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/hasHiddenNodes", bHasHidden);
            oViewModel.setProperty("/hiddenNodesList", aHiddenNodes);
        }
    }

    /**
     * @private
     * @description Maps the Focus Mode state to the UI Model.
     * @param {CustomEvent} oEvent - Custom DOM Event.
     */
    private _onFocusModeChanged(oEvent: globalThis.Event): void {
        const oCustomEvent = oEvent as unknown as CustomEvent;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/isFocusMode", oCustomEvent.detail?.isFocused || false);
            oViewModel.setProperty("/focusNodeName", oCustomEvent.detail?.nodeName || "");
        }
    }

    /**
     * @private
     * @description Checks if the user is currently typing in an input field.
     * @param {EventTarget | null} target - The DOM event target.
     * @returns {boolean}
     */
    private _isInputActive(target: EventTarget | null): boolean {
        if (!target) return false;
        const element = target as HTMLElement;
        const tagName = element.tagName?.toUpperCase();
        // Prevents hijacking the spacebar when navigating standard dropdowns or UI5 inputs
        return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable;
    }

    /**
     * @private
     * @description Toggles interaction mode when the spacebar is pressed.
     * @param {KeyboardEvent} e - Keydown event.
     * @returns {void}
     */
    private _onKeyDown(e: KeyboardEvent): void {
        if (!ViewStateHelper.isViewVisible(this._oView)) return;
        
        // Enterprise UX: Undo Stack
        if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.code === "KeyZ")) {
            e.preventDefault();
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.UNDO_REQUEST, { detail: { viewId: this._getInstanceId() } }));
            return;
        }

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
                Renderer.setInteractionMode(this._getInstanceId(), sEngine, "pan");
            }
        }

        // Enterprise UX: Allow deletion of visual sticky notes
        if ((e.code === "Delete" || e.code === "Backspace") && !this._isInputActive(e.target)) {
            e.preventDefault();
            if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent(DomEvents.DELETE_SELECTION_REQUEST, { detail: { viewId: this._getInstanceId() } }));
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
                Renderer.setInteractionMode(this._getInstanceId(), sEngine, "select");
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
                Renderer.setInteractionMode(this._getInstanceId(), sEngine, "select");
            }
        }
    }
}