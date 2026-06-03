/**
 * @fileoverview UI State Orchestrator.
 * @description Manages transient layout adjustments, layout data toggles, and UI model formatting resets.
 */

import JSONModel from "sap/ui/model/json/JSONModel";
import View from "sap/ui/core/mvc/View";
import Select from "sap/m/Select";
import SegmentedButton from "sap/m/SegmentedButton";
import Button from "sap/m/Button";
import SplitterLayoutData from "sap/ui/layout/SplitterLayoutData";
import VBox from "sap/m/VBox";
import Event from "sap/ui/base/Event";
import BusyDialog from "sap/m/BusyDialog";
import Renderer from "../renderer/Renderer";

export default class ViewStateHelper {

    private static _oBusyDialog?: BusyDialog;
    private static _iBusyTimer?: ReturnType<typeof setTimeout>;

    /**
     * @public
     * @description Generates the initial layout state model with defaults for all rendering engines.
     * @returns {JSONModel} The instantiated UI configuration model.
     */
    public static initializeUiModel(): JSONModel {
        const oDefaults = {
            showHelp: false,
            activeEngine: "CYTOSCAPE",
            isCanvasStale: false,
            isDrillDown: false,
            isRecording: false,
            isVideoPaused: false,
            _autoPaused: false,
            recordingMode: "SCREEN",
            recordingModeInput: "SCREEN",
            recordingTime: "00:00",
            videoResolution: "SCREEN",
            videoFps: "30",
            videoDelay: 5,
            videoMaxLength: 150,
            videoTitle: "",
            videoSubtitle: "",
            isCountingDown: false,
            isWaitingForPermission: false,
            isFetching: false,
            countdownTime: 5,
            enableVideoRecording: false,
            stealthMode: false,
            ...Renderer.getEngineDefaults()
        };
        return new JSONModel(oDefaults);
    }

    /**
     * @public
     * @description Syncs the active engine state and safely resets formatting configurations 
     * to prevent parameter bleed when switching between rendering engines.
     * @param {Event} oEvent - The Select change event.
     * @param {JSONModel} oUiModel - The bound UI configuration model.
     * @returns {string} The newly selected engine ID.
     */
    public static handleEngineChange(oEvent: Event, oUiModel: JSONModel): string {
        const sEngine = (oEvent.getSource() as Select).getSelectedKey();
        
        oUiModel.setProperty("/activeEngine", sEngine);
        
        // Reset all format configurations to their defaults
        Renderer.resetFormatConfigs(oUiModel);

        return sEngine;
    }

    /**
     * @public
     * @description Toggles visibility of relationship layout panels (Lines vs Discovery).
     * @param {Event} oEvent - The SegmentedButton press event.
     * @param {VBox} oBoxLines - The layout configuration container.
     * @param {VBox} oBoxDiscovery - The discovery configuration container.
     * @returns {void}
     */
    public static toggleRelMode(oEvent: Event, oBoxLines: VBox, oBoxDiscovery: VBox): void {
        const sSelectedMode = (oEvent.getSource() as SegmentedButton).getSelectedKey();
        oBoxLines.setVisible(sSelectedMode === "LINES");
        oBoxDiscovery.setVisible(sSelectedMode !== "LINES");
    }

    /**
     * @public
     * @description Modifies Splitter layout data to maximize the canvas view.
     * @param {Event} oEvent - The Button press event.
     * @param {SplitterLayoutData} oLeftPaneLayout - The target layout constraints.
     * @returns {void}
     */
    public static toggleFullScreen(oEvent: Event, oLeftPaneLayout: SplitterLayoutData): void {
        const oButton = oEvent.getSource() as Button;
        
        if (oButton.getIcon() === "sap-icon://exit-full-screen") {
            oLeftPaneLayout.setSize("400px"); 
            oButton.setIcon("sap-icon://full-screen");
        } else {
            oLeftPaneLayout.setSize("0px"); 
            oButton.setIcon("sap-icon://exit-full-screen");
        }
    }

    /**
     * @public
     * @static
     * @description Injects an invisible Glass Pane to swallow interactions during async fetches,
     * while surfacing a sleek, localized loading spinner that survives HTML5 Fullscreen layer promotions.
     */
    public static toggleGlassPane(bShow: boolean, oView: View): void {
        const oUiModel = oView.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/isFetching", bShow);

        if (!this._oBusyDialog) {
            this._oBusyDialog = new BusyDialog({ text: "Processing..." });
            oView.addDependent(this._oBusyDialog);
        }

        const doc = document as any;
        const bIsFullScreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);

        let oGlassPane = document.getElementById(`vdm-glass-pane-${oView.getId()}`);
        if (bShow) {
            if (!oGlassPane) {
                oGlassPane = document.createElement("div");
                oGlassPane.id = `vdm-glass-pane-${oView.getId()}`;
                Object.assign(oGlassPane.style, {
                    position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
                    zIndex: "999999", backgroundColor: "transparent", cursor: "wait"
                });
                const target = document.fullscreenElement || (document as any).webkitFullscreenElement || document.body;
                target.appendChild(oGlassPane);
            }

            // ENTERPRISE UX: Display the proper SAPUI5 Busy Dialog when in standard windowed mode
            if (!bIsFullScreen) {
                clearTimeout(this._iBusyTimer);
                this._iBusyTimer = setTimeout(() => {
                    this._oBusyDialog?.open();
                }, 300);
            }
        } else {
            if (oGlassPane) oGlassPane.remove();
            clearTimeout(this._iBusyTimer);
            this._oBusyDialog?.close();
        }
    }

    /**
     * @public
     * @static
     * @description Checks if the View's DOM element is physically painted and visible.
     * Protects global event listeners from firing when the Fiori Launchpad suspends the app in the background.
     * @param {View} oView - The active UI5 view.
     * @returns {boolean} True if the view is actively visible on the screen.
     */
    public static isViewVisible(oView: View): boolean {
        if (!oView) return false;
        const oDomRef = oView.getDomRef() as HTMLElement;
        // Ensure the element is actually painted and takes up physical space
        return !!oDomRef && oDomRef.offsetWidth > 0 && oDomRef.offsetHeight > 0;
    }
}