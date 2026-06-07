/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.helpers
 * @fileoverview Single Responsibility module for FCL Routing and Orchestration.
 * @description Decouples routing and variant manipulation from the display controller.
 */

import View from "sap/ui/core/mvc/View";
import UIComponent from "sap/ui/core/UIComponent";
import JSONModel from "sap/ui/model/json/JSONModel";
import Renderer from "../renderer/Renderer";
import { ModelNames, UiState, DiagramData } from "../constants/StateConstants";

export default class DiagramRoutingManager {

    /**
     * @public
     * @static
     * @description Detaches the active variant UUID and restores builder mode, wiping the URL deep link.
     */
    public static cloneToWorkspace(activeView: View, ownerComponent: UIComponent | undefined, viewId: string): void {
        const uiModel = activeView.getModel(ModelNames.UI) as JSONModel;
        if (!uiModel) return;

        // 1. Detach the original creator's Variant UUID from memory
        uiModel.setProperty(UiState.SELECTED_VARIANT, "");
        uiModel.setProperty(UiState.VARIANT_DIRTY, true);

        // 2. Restore Builder interaction constraints
        uiModel.setProperty(UiState.IS_VIEWER_MODE, false);
        uiModel.setProperty(UiState.FCL_LAYOUT, "TwoColumnsMidExpanded");

        // 3. Purge the deep link from the URL without triggering an OS-level page reload
        const router = ownerComponent?.getRouter();
        if (router) {
            router.navTo("RouteMain", {}, undefined, true);
        }
        
        // Re-hydrate the Selection pane with the cloned variant's state
        const variantState = uiModel.getProperty("/loadedVariantState");
        if (variantState) {
            // ENTERPRISE FIX: Capture LIVE viewer changes before cloning
            const dataModel = activeView.getModel(ModelNames.DIAGRAM_DATA) as JSONModel;
            if (dataModel) {
                const engineId = dataModel.getProperty(DiagramData.ENGINE);
                if (engineId && Renderer.supportsStateCapture(engineId)) {
                    const liveState = Renderer.getCanvasState(viewId, engineId);
                    if (liveState) {
                        variantState.canvasState = liveState;
                    }
                }
            }
            uiModel.setProperty("/clonedVariantState", variantState);
        }
    }
}
