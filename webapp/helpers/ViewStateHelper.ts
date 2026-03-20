/**
 * @fileoverview UI State Orchestrator.
 * @description Manages transient layout adjustments, layout data toggles, and UI model formatting resets.
 */

import JSONModel from "sap/ui/model/json/JSONModel";
import Select from "sap/m/Select";
import SegmentedButton from "sap/m/SegmentedButton";
import Button from "sap/m/Button";
import SplitterLayoutData from "sap/ui/layout/SplitterLayoutData";
import VBox from "sap/m/VBox";
import Event from "sap/ui/base/Event";

export default class ViewStateHelper {

    /**
     * @public
     * @description Generates the initial layout state model.
     * @returns {JSONModel} The instantiated UI configuration model.
     */
    public static initializeUiModel(): JSONModel {
        return new JSONModel({
            showHelp: false,
            activeEngine: "GRAPHVIZ",
            formatPlantUML: { lineStyle: "default", spaced_out: false, staggered: false, modern: true },
            formatGraphviz: { lineStyle: "default", spaced_out: false, modern: true, left_to_right: false, concentrate_edges: false, monochrome: false },
            formatMermaid: { direction: "TB", theme: "default" }
        });
    }

    /**
     * @public
     * @description Syncs the active engine state and safely resets formatting configurations.
     * @param {Event} oEvent - The Select change event.
     * @param {JSONModel} oUiModel - The bound UI configuration model.
     * @returns {string} The newly selected engine ID.
     */
    public static handleEngineChange(oEvent: Event, oUiModel: JSONModel): string {
        const sEngine = (oEvent.getSource() as Select).getSelectedKey();
        
        oUiModel.setProperty("/activeEngine", sEngine);
        oUiModel.setProperty("/formatPlantUML", { lineStyle: "default", spaced_out: false, staggered: false, modern: true });
        oUiModel.setProperty("/formatGraphviz", { lineStyle: "default", spaced_out: false, modern: true, left_to_right: false, concentrate_edges: false, monochrome: false });
        oUiModel.setProperty("/formatMermaid", { direction: "TB", theme: "default" });

        return sEngine;
    }

    /**
     * @public
     * @description Toggles visibility of relationship layout panels.
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
}