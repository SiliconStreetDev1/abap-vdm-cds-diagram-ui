/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.controller
 * @fileoverview Dedicated controller for the Settings Dialog Fragment.
 * @description Manages configuration state for global audio and gamification plugins.
 * Adheres strictly to SOLID principles and deterministic state management.
 */

import Controller from "sap/ui/core/mvc/Controller";
import JSONModel from "sap/ui/model/json/JSONModel";
import Event from "sap/ui/base/Event";
import View from "sap/ui/core/mvc/View";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import List from "sap/m/List";
import StandardListItem from "sap/m/StandardListItem";

import Renderer from "../renderer/Renderer";
import { UiState, ModelNames, DiagramData } from "../constants/StateConstants";
import { StorageKeys } from "../constants/StorageConstants";

export default class SettingsDialogController extends Controller {
    
    private parentView: View;

    /**
     * @public
     * @constructor
     * @param {View} parentView - The parent Fiori View that instantiated this fragment.
     * @description Injects the parent view reference to ensure deterministic access 
     * to the centralized data models without singleton side-effects.
     */
    constructor(parentView: View) {
        super("nz.co.siliconstreet.vdmdiagrammer.controller.SettingsDialog");
        this.parentView = parentView;
    }

    /**
     * @public
     * @description Fired immediately before the Dialog opens. Queries the active
     * rendering engine for available plugins and deterministically syncs the UI selections.
     * @returns {void}
     */
    public onBeforeOpen(): void {
        const diagramDataModel = this.parentView.getModel(ModelNames.DIAGRAM_DATA) as JSONModel;
        if (!diagramDataModel) {
            return;
        }

        const engineId = diagramDataModel.getProperty(DiagramData.ENGINE) as string;
        const availableEffects = Renderer.getAvailableEffects(engineId);

        const viewModel = this.parentView.getModel(ModelNames.VIEW) as JSONModel;
        viewModel.setProperty("/hasEffects", availableEffects.length > 0);
        viewModel.setProperty("/availableEffects", availableEffects);

        // Defer selection strictly until the list bindings have flushed to the DOM
        setTimeout(() => {
            const effectsListControl = this.parentView.byId("listEffects") as List;
            if (effectsListControl) {
                effectsListControl.removeSelections(true);
                
                const listItems = effectsListControl.getItems() as StandardListItem[];
                listItems.forEach((listItem: StandardListItem, index: number) => {
                    const currentEffect = availableEffects[index];
                    if (currentEffect && currentEffect.enabled) {
                        effectsListControl.setSelectedItem(listItem, true);
                    }
                });
            }
        }, 50);
    }

    /**
     * @public
     * @description Toggles the global UI audio setting and explicitly persists the state 
     * to the browser's localStorage to ensure cross-session retention.
     * @param {Event} toggleEvent - The underlying UI5 Switch toggle event payload.
     * @returns {void}
     */
    public onToggleAudio(toggleEvent: Event): void {
        const uiModel = this.parentView.getModel(ModelNames.UI) as JSONModel;
        if (uiModel) {
            const switchState = (toggleEvent as any).getParameter("state") as boolean;
            const isAudioEnabled = switchState !== undefined ? switchState : !uiModel.getProperty(UiState.ENABLE_AUDIO);
            
            uiModel.setProperty(UiState.ENABLE_AUDIO, isAudioEnabled);
            
            // Explicitly handle localStorage I/O with deliberate string casting and centralized keys
            localStorage.setItem(StorageKeys.AUDIO_ENABLED, isAudioEnabled ? "true" : "false");
        }
    }

    /**
     * @public
     * @description Commits the MultiSelect list selections to the Engine Facade layer
     * and triggers local storage persistence. Isolates the UI logic from the physics engine.
     * @returns {void}
     */
    public onSaveSettings(): void {
        const diagramDataModel = this.parentView.getModel(ModelNames.DIAGRAM_DATA) as JSONModel;
        if (!diagramDataModel) {
            return;
        }

        const engineId = diagramDataModel.getProperty(DiagramData.ENGINE) as string;
        const effectsListControl = this.parentView.byId("listEffects") as List;
        const viewModel = this.parentView.getModel(ModelNames.VIEW) as JSONModel;
        
        const availableEffects = viewModel.getProperty("/availableEffects") as { id: string; name: string; enabled: boolean }[];
        
        if (effectsListControl && availableEffects) {
            const selectedItems = effectsListControl.getSelectedItems() as StandardListItem[];
            const selectedIndices = selectedItems.map((item: StandardListItem) => effectsListControl.indexOfItem(item));
            
            availableEffects.forEach((effect, index: number) => {
                const isEnabled = selectedIndices.includes(index);
                Renderer.toggleEffect(engineId, effect.id, isEnabled);
            });
        }
        
        this.onCloseSettings();
        MessageToast.show("Settings securely saved.");
    }

    /**
     * @public
     * @description Closes the configuration dialog deterministically.
     * @returns {void}
     */
    public onCloseSettings(): void {
        const settingsDialogControl = this.parentView.byId("dlgSettings") as Dialog;
        if (settingsDialogControl) {
            settingsDialogControl.close();
        }
    }

    /**
     * @public
     * @description Issues a factory reset for gamification plugins and refreshes the dialog UI.
     */
    public onResetPlugins(): void {
        const diagramDataModel = this.parentView.getModel(ModelNames.DIAGRAM_DATA) as JSONModel;
        if (!diagramDataModel) return;

        const engineId = diagramDataModel.getProperty(DiagramData.ENGINE) as string;
        Renderer.resetEffectsDefaults(engineId);
        
        MessageToast.show("Gamification plugins reset to default Enterprise values.");
        
        // Re-read available effects and update UI checkboxes immediately
        this.onBeforeOpen();
    }
}
