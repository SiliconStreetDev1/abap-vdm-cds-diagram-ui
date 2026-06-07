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

import ResponsivePopover from "sap/m/ResponsivePopover";
import Slider from "sap/m/Slider";
import Control from "sap/ui/core/Control";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Renderer from "../../renderer/Renderer";
import { UiState, ViewState, DiagramData } from "../../constants/StateConstants";
import { EventManager } from "../../events/EventManager";
import { Subscription } from "../../events/Subscription";

/**
 * @class CanvasActionHandler
 * @description Manages routing for user interactions on the UI toolbar to the active rendering engine.
 */
export default class CanvasActionHandler {
    private view: View;

    private spacingPopover?: ResponsivePopover;
    private subscriptions: Subscription[] = [];
    private isAttached: boolean = false;

    /**
     * @constructor
     * @param {View} view - Reference to the active UI5 view.
     */
    constructor(view: View) {
        this.view = view;
    }

    /**
     * @private
     * @description Resolves the overarching Component ID to group Views in the same FCL.
     * @returns {string} Unique Instance ID.
     */
    private getInstanceId(): string {
        return this.view.getController()?.getOwnerComponent()?.getId() || this.view.getId();
    }

    /**
     * @public
     * @description Attaches custom DOM event listeners.
     * @returns {void}
     */
    public attachEvents(): void {
        if (this.isAttached) return;

        EventManager.getInstance().subscribe("canvas:closeMinimapRequest", this.onCloseMinimapRequest.bind(this), this.view);
        EventManager.getInstance().subscribe("canvas:focusModeChanged", this.onFocusModeChanged.bind(this), this.view);
        
        this.isAttached = true;
    }

    /**
     * @public
     * @description Detaches DOM event listeners.
     * @returns {void}
     */
    public detachEvents(): void {
        if (!this.isAttached) return;




        if (this.spacingPopover) {
            this.spacingPopover.destroy();
            this.spacingPopover = undefined;
        }
        
        this.isAttached = false;
    }

    /**
     * @public
     * @description Disables or enables the Cytoscape minimap panel.
     * @param {Event} oEvent - The toggle button event.
     * @returns {void}
     */
    public toggleMinimap(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        (this.view.getModel("view") as JSONModel).setProperty(ViewState.SHOW_MINIMAP, bPressed);
        const engineId = (this.view.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.toggleMinimap(this.getInstanceId(), engineId, bPressed);
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
        const oViewModel = this.view.getModel("view") as JSONModel;
        oViewModel.setProperty(ViewState.IS_SELECT_MODE, bSelectMode);
        
        const engineId = (this.view.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.setInteractionMode(this.getInstanceId(), engineId, bSelectMode ? "select" : "pan");
    }

    /**
     * @public
     * @description Activates a temporary Focus Mode on the currently selected entity.
     * @param {Event} oEvent - The toggle button event.
     */
    public toggleTempFocusMode(oEvent: Event): void {
        const bPressed = (oEvent.getSource() as ToggleButton).getPressed();
        const oViewModel = this.view.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty(ViewState.TEMP_FOCUS_MODE, bPressed);
        
        const engineId = (this.view.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.setTempFocusMode(this.getInstanceId(), engineId, bPressed);
    }

    /**
     * @public
     * @description Dispatches formatting configuration parameters to the active renderer.
     * @returns {void}
     */
    public changeSpacing(): void {
        const uiModel = this.view.getModel("ui") as JSONModel;
        const engineId = (this.view.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        
        if (uiModel && Renderer.supportsLiveUpdate(engineId)) {
            const oModelData = uiModel.getData();
            const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${engineId}`);
            if (sFormatKey) {
                const oFormatConfig = Object.assign({}, uiModel.getProperty(`/${sFormatKey}`));
                EventManager.getInstance().publish("diagram:liveFormatUpdate", { engine: engineId, format: oFormatConfig });
                
                EventManager.getInstance().publish("canvas:formatSliderUpdate", { viewId: this.getInstanceId(), node_spacing: oFormatConfig.node_spacing });
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
        if (!this.spacingPopover) {
            const uiModel = this.view.getModel("ui") as JSONModel;
            const engineId = uiModel ? uiModel.getProperty("/activeEngine") : Renderer.getDefaultEngine();
            const oModelData = uiModel ? uiModel.getData() : {};
            const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${engineId}`) || "formatCytoscape";

            this.spacingPopover = new ResponsivePopover({
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
            this.view.addDependent(this.spacingPopover);
        }
        this.spacingPopover.openBy(oEvent.getSource() as Control);
    }

    /**
     * @public
     * @description Search handler for locating specific nodes in the active canvas.
     */
    public searchCanvas(oEvent: SearchField$SearchEvent): void {
        const sQuery = oEvent.getParameter("query") || "";
        const engineId = (this.view.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE);
        Renderer.searchCanvas(this.getInstanceId(), engineId, sQuery);
    }

    /**
     * @public
     * @description Drops all active selections from the canvas.
     * @returns {void}
     */
    public clearSelection(): void {
        Renderer.clearSelection(this.getInstanceId(), (this.view.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE));
    }

    /**
     * @public
     * @description Selects all active nodes on the canvas.
     * @returns {void}
     */
    public selectAll(): void {
        Renderer.selectAll(this.getInstanceId(), (this.view.getModel("diagramData") as JSONModel).getProperty(DiagramData.ENGINE));
    }

    /**
     * @private
     * @description Intercepts events requesting a teardown of the minimap control.
     * @returns {void}
     */
    private onCloseMinimapRequest(oPayload: { viewId?: string }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        (this.view.getModel("view") as JSONModel)?.setProperty(ViewState.SHOW_MINIMAP, false);
        Renderer.toggleMinimap(this.getInstanceId(), (this.view.getModel("diagramData") as JSONModel)?.getProperty(DiagramData.ENGINE), false);
    }

    /**
     * @private
     * @description Maps the Focus Mode state to the UI Model.
     * @param {any} oPayload - Payload from EventManager
     */
    private onFocusModeChanged(oPayload: { viewId?: string, isFocused?: boolean, nodeName?: string, hasNodeSelected?: boolean, tempFocusMode?: boolean }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        const oViewModel = this.view.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty(ViewState.IS_FOCUS_MODE, oPayload?.isFocused || false);
            oViewModel.setProperty(ViewState.FOCUS_NODE_NAME, oPayload?.nodeName || "");
            if (oPayload?.hasNodeSelected !== undefined) {
                oViewModel.setProperty(ViewState.HAS_NODE_SELECTED, oPayload.hasNodeSelected);
            }
            if (oPayload?.tempFocusMode !== undefined) {
                oViewModel.setProperty(ViewState.TEMP_FOCUS_MODE, oPayload.tempFocusMode);
            }
        }
    }

    /**
     * @public
     * @description Broadcasts layout node spacing changes.
     * @param {any} oEvent - We actually don't use this directly anymore, but it might be called from somewhere. Let's see...
     * @returns {void}
     */
    public onSliderUpdate(oPayload: { viewId?: string, node_spacing?: number }): void {
        if (oPayload?.viewId && oPayload.viewId !== this.getInstanceId()) return;
        if (oPayload?.node_spacing) {
            const uiModel = this.view.getModel("ui") as JSONModel;
            if (uiModel) {
                const engineId = uiModel.getProperty("/activeEngine");
                const oModelData = uiModel.getData();
                const sFormatKey = Object.keys(oModelData).find(sKey => sKey.toUpperCase() === `FORMAT${engineId}`);
                if (sFormatKey) {
                    uiModel.setProperty(`/${sFormatKey}/node_spacing`, oPayload.node_spacing);
                    uiModel.setProperty("/variantDirty", true);
                }
            }
        }
    }
}
