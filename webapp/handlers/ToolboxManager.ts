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

interface IToolboxInstance {
    handlers: any[]; // Kept loose for generic handlers, but strongly typed below
    renderHandler: DiagramRenderHandler;
    fullScreenHandler: FullScreenHandler;
    canvasActionHandler: CanvasActionHandler;
    videoRecordHandler: VideoRecordHandler;
}

export default class ToolboxManager {
    private static instances: Map<string, IToolboxInstance> = new Map();

    /**
     * @public
     * @static
     * @description Initializes all canvas interaction handlers and binds their events.
     * @param {string} viewId - Active Fiori View ID
     * @param {View} activeView - Active Fiori View
     * @param {Function} getTextDelegate - i18n localization delegate
     */
    public static bootstrap(viewId: string, activeView: View, getTextDelegate: (key: string, args?: any[]) => string): void {
        this.destroy(viewId); // Ensure clean slate

        DialogManager.bootstrap(viewId, activeView);

        const instanceData: IToolboxInstance = {
            handlers: [],
            renderHandler: new DiagramRenderHandler(activeView, getTextDelegate),
            fullScreenHandler: new FullScreenHandler(activeView),
            canvasActionHandler: new CanvasActionHandler(activeView),
            videoRecordHandler: new VideoRecordHandler(activeView, getTextDelegate)
        };

        const coreHandlers = [
            instanceData.renderHandler,
            instanceData.fullScreenHandler,
            instanceData.canvasActionHandler,
            new AnnotationHandler(activeView),
            new CanvasKeyboardHandler(activeView),
            new DiagramStateActionHandler(activeView),
            instanceData.videoRecordHandler
        ];

        coreHandlers.forEach(handler => {
            if ((handler as any).attachEvents) (handler as any).attachEvents();
            instanceData.handlers.push(handler);
        });

        this.instances.set(viewId, instanceData);
    }

    /**
     * @public
     * @static
     * @description Returns the Render Handler instance.
     */
    public static getRenderHandler(viewId: string): DiagramRenderHandler | null { 
        return this.instances.get(viewId)?.renderHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Returns the Full Screen Handler instance.
     */
    public static getFullScreenHandler(viewId: string): FullScreenHandler | null { 
        return this.instances.get(viewId)?.fullScreenHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Returns the Canvas Action Handler instance.
     */
    public static getCanvasActionHandler(viewId: string): CanvasActionHandler | null { 
        return this.instances.get(viewId)?.canvasActionHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Returns the Video Record Handler instance.
     */
    public static getVideoRecordHandler(viewId: string): VideoRecordHandler | null { 
        return this.instances.get(viewId)?.videoRecordHandler || null; 
    }

    /**
     * @public
     * @static
     * @description Detaches all events and clears handlers from memory for a specific view.
     */
    public static destroy(viewId: string): void {
        const instanceData = this.instances.get(viewId);
        if (instanceData) {
            instanceData.handlers.forEach(handler => {
                if ((handler as any).detachEvents) (handler as any).detachEvents();
                if ((handler as any).destroy) (handler as any).destroy();
            });
            if (instanceData.videoRecordHandler) {
                instanceData.videoRecordHandler.stopRecording();
            }
            this.instances.delete(viewId);
        }
        
        DialogManager.destroy(viewId);
    }
}
