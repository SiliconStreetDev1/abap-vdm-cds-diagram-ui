/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Encapsulates Canvas Toolbar Interactions (Spacing, Minimap, Search).
 * @description Slimmed down routing orchestrator.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import ToggleButton from "sap/m/ToggleButton";
import SegmentedButton from "sap/m/SegmentedButton";
import EventBus from "sap/ui/core/EventBus";
import ResponsivePopover from "sap/m/ResponsivePopover";
import Slider from "sap/m/Slider";
import Control from "sap/ui/core/Control";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Renderer from "../../renderer/Renderer";
import { EventChannels, EventIds, DomEvents } from "../../constants/EventConstants";
import { UiState, ViewState, DiagramData } from "../../constants/StateConstants";

export default class CanvasActionHandler {
    private _oView: View;
    private _oEventBus?: EventBus;
    private _fnCloseMinimapRequestBind!: EventListener;
    private _fnFocusModeChangedBind!: EventListener;
    private _oSpacingPopover?: ResponsivePopover;
    private _bIsAttached: boolean = false;

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
        if (this._bIsAttached) return;

        this._fnCloseMinimapRequestBind = this._onCloseMinimapRequest.bind(this) as EventListener;
        this._fnFocusModeChangedBind = this._onFocusModeChanged.bind(this) as EventListener;

        document.addEventListener(DomEvents.CLOSE_MINIMAP, this._fnCloseMinimapRequestBind);
        document.addEventListener(DomEvents.FOCUS_MODE_CHANGED, this._fnFocusModeChangedBind);
        
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Detaches DOM event listeners.
     * @returns {void}
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;

        document.removeEventListener(DomEvents.CLOSE_MINIMAP, this._fnCloseMinimapRequestBind);
        document.removeEventListener(DomEvents.FOCUS_MODE_CHANGED, this._fnFocusModeChangedBind);
        if (this._oSpacingPopover) {
            this._oSpacingPopover.destroy();
            this._oSpacingPopover = undefined;
        }
        
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Disables or enables the Cytoscape minimap panel.
     * @param {Event} oEvent - The toggle button event.
     * @returns {void}
     */
    public toggleMinimap(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        (this._oView.getModel("view") as JSONModel).setProperty(ViewState.SHOW_MINIMAP, bPressed);
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.toggleMinimap(this._getInstanceId(), sEngine, bPressed);
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
        oViewModel.setProperty(ViewState.IS_SELECT_MODE, bSelectMode);
        
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.setInteractionMode(this._getInstanceId(), sEngine, bSelectMode ? "select" : "pan");
    }

    /**
     * @public
     * @description Activates a temporary Focus Mode on the currently selected entity.
     * @param {Event} oEvent - The toggle button event.
     */
    public toggleTempFocusMode(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty(ViewState.TEMP_FOCUS_MODE, bPressed);
        
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.setTempFocusMode(this._getInstanceId(), sEngine, bPressed);
    }

    /**
     * @public
     * @description Dispatches formatting configuration parameters to the active renderer.
     * @returns {void}
     */
    public changeSpacing(): void {
        const oUiModel = this._oView.getModel("ui") as JSONModel;
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        
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
            const oUiModel = this._oView.getModel("ui") as JSONModel;
            const sEngine = oUiModel ? oUiModel.getProperty("/activeEngine") : "CYTOSCAPE";
            const oModelData = oUiModel ? oUiModel.getData() : {};
            const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`) || "formatCytoscape";

            this._oSpacingPopover = new ResponsivePopover({
                showHeader: false,
                placement: "Top",
                contentWidth: "300px",
                verticalScrolling: false,
                horizontalScrolling: false,
                content: [
                    new Slider({ 
                        width: "260px",
                        value: `{ui>/${sFormatKey}/node_spacing}`, 
                        min: 50, max: 250, step: 25, enableTickmarks: true, 
                        change: this.changeSpacing.bind(this),
                        enabled: `{= \${ui>/${sFormatKey}/layout_algorithm} !== 'preset' }`
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
        const sEngine = (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.searchCanvas(this._getInstanceId(), sEngine, sQuery);
    }

    /**
     * @public
     * @description Drops all active selections from the canvas.
     * @returns {void}
     */
    public clearSelection(): void {
        Renderer.clearSelection(this._getInstanceId(), (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE));
    }

    /**
     * @public
     * @description Selects all active nodes on the canvas.
     * @returns {void}
     */
    public selectAll(): void {
        Renderer.selectAll(this._getInstanceId(), (this._oView.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE));
    }

    /**
     * @private
     * @description Intercepts events requesting a teardown of the minimap control.
     * @returns {void}
     */
    private _onCloseMinimapRequest(oEvent: globalThis.Event): void {
        const oCustomEvent = oEvent as unknown as CustomEvent<{ viewId: string }>;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        (this._oView.getModel("view") as JSONModel)?.setProperty(ViewState.SHOW_MINIMAP, false);
        Renderer.toggleMinimap(this._getInstanceId(), (this._oView.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE), false);
    }

    /**
     * @private
     * @description Maps the Focus Mode state to the UI Model.
     * @param {CustomEvent} oEvent - Custom DOM Event.
     */
    private _onFocusModeChanged(oEvent: globalThis.Event): void {
        const oCustomEvent = oEvent as unknown as CustomEvent<{ viewId: string, isFocused: boolean, nodeName: string, hasNodeSelected: boolean, tempFocusMode: boolean }>;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail?.viewId !== this._getInstanceId()) return;
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty(ViewState.IS_FOCUS_MODE, oCustomEvent.detail?.isFocused || false);
            oViewModel.setProperty(ViewState.FOCUS_NODE_NAME, oCustomEvent.detail?.nodeName || "");
            if (oCustomEvent.detail?.hasNodeSelected !== undefined) {
                oViewModel.setProperty(ViewState.HAS_NODE_SELECTED, oCustomEvent.detail.hasNodeSelected);
            }
            if (oCustomEvent.detail?.tempFocusMode !== undefined) {
                oViewModel.setProperty(ViewState.TEMP_FOCUS_MODE, oCustomEvent.detail.tempFocusMode);
            }
        }
    }

    /**
     * @public
     * @description Broadcasts layout node spacing changes.
     * @param {any} oEvent - UI Custom Slider Event.
     * @returns {void}
     */
    public onSliderUpdate(oEvent: globalThis.Event): void {
        const oCustomEvent = oEvent as unknown as CustomEvent<{ viewId: string, node_spacing: number }>;
        if (oCustomEvent.detail?.viewId && oCustomEvent.detail.viewId !== this._getInstanceId()) return;
        if (oCustomEvent.detail?.node_spacing) {
            const oUiModel = this._oView.getModel("ui") as JSONModel;
            if (oUiModel) {
                const sEngine = oUiModel.getProperty("/activeEngine");
                const oModelData = oUiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${sEngine}`);
                if (sFormatKey) {
                    oUiModel.setProperty(`/${sFormatKey}/node_spacing`, oCustomEvent.detail.node_spacing);
                    oUiModel.setProperty("/variantDirty", true);
                }
            }
        }
    }
}
