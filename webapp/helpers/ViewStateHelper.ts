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
import Renderer from "../renderer/Renderer";
import UIComponent from "sap/ui/core/UIComponent";
import BusyDialog from "sap/m/BusyDialog";
import { AppConstants } from "../constants/StateConstants";

export default class ViewStateHelper {
    private static _busyDialog?: BusyDialog;

    /**
     * @public
     * @description Generates the initial layout state model with defaults for all rendering engines.
     * @returns {JSONModel} The instantiated UI configuration model.
     */
    public static initializeUiModel(): JSONModel {
        const oDefaults = {
            showHelp: false,
            activeEngine: Renderer.getDefaultEngine(),
            isCanvasStale: false,
            isDrillDown: false,
            selectedVariant: "",
            isGlobal: false,
            isUnlisted: false,
            isRecording: false,
            isVideoPaused: false,
            _autoPaused: false,
            recordingMode: "SCREEN",
            recordingModeInput: "SCREEN",
            recordingTime: "00:00",
            videoResolution: "SCREEN",
            videoFps: "30",
            videoQuality: "HIGH",
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
            enableAudio: localStorage.getItem("vdmAudioEnabled") !== "false",
            nodeSpacingMin: AppConstants.NODE_SPACING_MIN,
            nodeSpacingMax: AppConstants.NODE_SPACING_MAX,
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

    /**
     * @public
     * @static
     * @description Locks the entire Fiori application tile (both panes) with optional conversational text.
     * @param {boolean} bBusy - True to show the busy indicator, false to hide it.
     * @param {View | UIComponent} oContext - The active view or overarching component.
     * @param {string | boolean} [sTextOptions] - Custom text to display. If True, selects a fun random message.
     */
    public static setAppBusy(bBusy: boolean, oContext: View | UIComponent, sTextOptions?: string | boolean): void {
        const oComponent = (typeof (oContext as any).getController === "function") 
            ? ((oContext as View).getController()?.getOwnerComponent() as UIComponent)
            : (oContext as UIComponent);
            
        const oRootControl = oComponent?.getRootControl();
        
        const oUiModel = oComponent?.getModel("ui") as JSONModel;
        if (oUiModel) oUiModel.setProperty("/isFetching", bBusy); // Engage/Release the global keyboard hardware lock

        if (bBusy) {
            let sDisplayText = typeof sTextOptions === "string" ? sTextOptions : undefined;
            if (sTextOptions === true) {
                let aFunMessages = [
                    "Your diagram is on its way! Please wait...",
                    "Untangling the architecture...",
                    "Summoning your CDS models...",
                    "Calculating spatial physics...",
                    "Routing relationships..."
                ];

                const oMsgModel = oComponent?.getModel("messages") as JSONModel;
                if (oMsgModel) {
                    const messages = oMsgModel.getProperty("/messages");
                    if (messages && Array.isArray(messages) && messages.length > 0) {
                        aFunMessages = messages;
                    }
                }

                sDisplayText = aFunMessages[Math.floor(Math.random() * aFunMessages.length)];
            }

            if (sDisplayText) {
                if (this._busyDialog) {
                    this._busyDialog.destroy();
                }

                let sIcon = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzA4NTRhMCIgZD0iTTIwLDNINHYxMGMwLDIuMjEsMS43OSw0LDQsNGg2YzIuMjEsMCw0LTEuNzksNC00di0zaDJjMS4xLDAsMi0wLjksMi0yVjVDMjIsMy45LDIxLjEsMywyMCwzeiBNMTgsOGgtMlY1aDJWOHogTTQsMTloMTZ2Mkg0VjE5eiIvPjwvc3ZnPg==";
                let iSpeed = 1000;
                
                const oAnimModel = oComponent?.getModel("animations") as JSONModel;
                if (oAnimModel) {
                    const animations = oAnimModel.getProperty("/animations");
                    if (animations && Array.isArray(animations) && animations.length > 0) {
                        const randomAnim = animations[Math.floor(Math.random() * animations.length)];
                        sIcon = randomAnim.icon;
                        iSpeed = randomAnim.speed;
                    }
                }

                this._busyDialog = new BusyDialog({
                    customIcon: sIcon,
                    customIconRotationSpeed: iSpeed,
                    customIconWidth: "44px",
                    customIconHeight: "44px",
                    text: sDisplayText
                });

                if (typeof (oContext as any).addDependent === "function") {
                    (oContext as View).addDependent(this._busyDialog);
                }
                this._busyDialog.open();
            } else {
                if (oRootControl && typeof (oRootControl as any).setBusy === "function") {
                    (oRootControl as any).setBusy(true);
                } else if (typeof (oContext as any).setBusy === "function") {
                    (oContext as View).setBusy(true);
                }
            }
        } else {
            // Unconditionally release all locks
            if (this._busyDialog) this._busyDialog.close();
            if (oRootControl && typeof (oRootControl as any).setBusy === "function") {
                (oRootControl as any).setBusy(false);
            } else if (typeof (oContext as any).setBusy === "function") {
                (oContext as View).setBusy(false);
            }
        }
    }
}