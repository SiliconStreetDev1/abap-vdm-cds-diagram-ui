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
    private static _handlers: any[] = [];
    private static _oRenderHandler: DiagramRenderHandler | null = null;
    private static _oFullScreenHandler: FullScreenHandler | null = null;
    private static _oCanvasActionHandler: CanvasActionHandler | null = null;
    private static _oVideoRecordHandler: VideoRecordHandler | null = null;

    /**
     * @public
     * @static
     * @description Initializes all canvas interaction handlers and binds their events.
     * @param {View} oView - Active Fiori View
     * @param {Function} fnGetText - i18n localization delegate
     */
    public static bootstrap(oView: View, fnGetText: (key: string, args?: any[]) => string): void {
        this.destroy(); // Ensure clean slate

        DialogManager.bootstrap(oView);

        this._oRenderHandler = new DiagramRenderHandler(oView, fnGetText);
        this._oFullScreenHandler = new FullScreenHandler(oView);
        this._oCanvasActionHandler = new CanvasActionHandler(oView);
        this._oVideoRecordHandler = new VideoRecordHandler(oView, fnGetText);

        const aCoreHandlers = [
            this._oRenderHandler,
            this._oFullScreenHandler,
            this._oCanvasActionHandler,
            new AnnotationHandler(oView),
            new CanvasKeyboardHandler(oView),
            new DiagramStateActionHandler(oView),
            this._oVideoRecordHandler
        ];

        aCoreHandlers.forEach(handler => {
            if (handler.attachEvents) handler.attachEvents();
            this._handlers.push(handler);
        });
    }

    /**
     * @public
     * @static
     * @description Returns the Render Handler instance.
     */
    public static getRenderHandler(): DiagramRenderHandler | null { return this._oRenderHandler; }

    /**
     * @public
     * @static
     * @description Returns the Full Screen Handler instance.
     */
    public static getFullScreenHandler(): FullScreenHandler | null { return this._oFullScreenHandler; }

    /**
     * @public
     * @static
     * @description Returns the Canvas Action Handler instance.
     */
    public static getCanvasActionHandler(): CanvasActionHandler | null { return this._oCanvasActionHandler; }

    /**
     * @public
     * @static
     * @description Returns the Video Record Handler instance.
     */
    public static getVideoRecordHandler(): VideoRecordHandler | null { return this._oVideoRecordHandler; }

    /**
     * @public
     * @static
     * @description Detaches all events and clears handlers from memory.
     */
    public static destroy(): void {
        DialogManager.destroy();
        this._handlers.forEach(handler => {
            if (handler.detachEvents) handler.detachEvents();
        });
        if (this._oVideoRecordHandler) {
            this._oVideoRecordHandler.stopRecording();
        }
        this._handlers = [];
        this._oRenderHandler = null;
        this._oFullScreenHandler = null;
        this._oCanvasActionHandler = null;
        this._oVideoRecordHandler = null;
    }
}
