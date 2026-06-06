/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Centralized registry for Canvas interaction handlers.
 * @description Decouples Diagram.controller.ts from manual dependency injection and lifecycle management.
 */

import View from "sap/ui/core/mvc/View";
import FullScreenHandler from "./ui/FullScreenHandler";
import CanvasActionHandler from "./canvas/CanvasActionHandler";
import CanvasKeyboardHandler from "./canvas/CanvasKeyboardHandler";
import AnnotationHandler from "./canvas/AnnotationHandler";
import DiagramStateActionHandler from "./state/DiagramStateActionHandler";
import DiagramRenderHandler from "./canvas/DiagramRenderHandler";
import VideoRecordHandler from "./state/VideoRecordHandler";
import DialogManager from "./ui/DialogManager";

export default class ToolboxManager {
    private static _instances: Map<string, any> = new Map();

    /**
     * @public
     * @static
     * @description Initializes all canvas interaction handlers and binds their events.
     * @param {string} sViewId - Active Fiori View ID
     * @param {View} oView - Active Fiori View
     * @param {Function} fnGetText - i18n localization delegate
     */
    public static bootstrap(sViewId: string, oView: View, fnGetText: (key: string, args?: any[]) => string): void {
        this.destroy(sViewId); // Ensure clean slate

        DialogManager.bootstrap(sViewId, oView);

        const instanceData: any = {
            handlers: [],
            oRenderHandler: new DiagramRenderHandler(oView, fnGetText),
            oFullScreenHandler: new FullScreenHandler(oView),
            oCanvasActionHandler: new CanvasActionHandler(oView),
            oVideoRecordHandler: new VideoRecordHandler(oView, fnGetText)
        };

        const aCoreHandlers = [
            instanceData.oRenderHandler,
            instanceData.oFullScreenHandler,
            instanceData.oCanvasActionHandler,
            new AnnotationHandler(oView),
            new CanvasKeyboardHandler(oView),
            new DiagramStateActionHandler(oView),
            instanceData.oVideoRecordHandler
        ];

        aCoreHandlers.forEach(handler => {
            if (handler.attachEvents) handler.attachEvents();
            instanceData.handlers.push(handler);
        });

        this._instances.set(sViewId, instanceData);
    }

    /**
     * @public
     * @static
     * @description Returns the Render Handler instance.
     */
    public static getRenderHandler(sViewId: string): DiagramRenderHandler | null { 
        return this._instances.get(sViewId)?.oRenderHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Returns the Full Screen Handler instance.
     */
    public static getFullScreenHandler(sViewId: string): FullScreenHandler | null { 
        return this._instances.get(sViewId)?.oFullScreenHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Returns the Canvas Action Handler instance.
     */
    public static getCanvasActionHandler(sViewId: string): CanvasActionHandler | null { 
        return this._instances.get(sViewId)?.oCanvasActionHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Returns the Video Record Handler instance.
     */
    public static getVideoRecordHandler(sViewId: string): VideoRecordHandler | null { 
        return this._instances.get(sViewId)?.oVideoRecordHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Detaches all events and clears handlers from memory for a specific view.
     */
    public static destroy(sViewId: string): void {
        // Wait, DialogManager is a global singleton right now, but its destroy doesn't take viewId. 
        // We probably shouldn't blindly call it if other views are active, but let's leave it as it was if we don't have viewId in DialogManager.
        // DialogManager.destroy() might need a fix too if it's not multi-instance, but the bug was ToolboxManager.
        const instanceData = this._instances.get(sViewId);
        if (instanceData) {
            instanceData.handlers.forEach((handler: any) => {
                if (handler.detachEvents) handler.detachEvents();
            });
            if (instanceData.oVideoRecordHandler) {
                instanceData.oVideoRecordHandler.stopRecording();
            }
            this._instances.delete(sViewId);
        }
        
        // Only destroy DialogManager if this is the last instance
        if (this._instances.size === 0) {
            DialogManager.destroy();
        }
    }
}
