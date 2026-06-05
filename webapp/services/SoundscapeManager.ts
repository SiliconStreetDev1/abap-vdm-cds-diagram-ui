/**
 * @fileoverview Manages UI Haptics and Audio Feedback.
 * @description Integrates RLO-Engine for procedural audio synthesis.
 * Operates as a decoupled observer to uphold the Single Responsibility Principle.
 */
import EventBus from "sap/ui/core/EventBus";
import { EventChannels, EventIds, DomEvents } from "../constants/EventConstants";
import ConfigManager from "../renderer/ConfigManager";

export default class SoundscapeManager {
    private static _engine: any = null;
    private static _audioCtx: AudioContext | null = null;
    private static _eventBus?: EventBus;
    private static _bIsAttached: boolean = false;

    private static _bMuteNextCanvasReady: boolean = false;
    private static _iMuteFailsafeTimer?: ReturnType<typeof setTimeout>;
    private static _iLastRenderRequestTime: number = 0;

    private static _fnNodePinnedBind?: EventListener;
    private static _fnUndoRequestBind?: EventListener;
    private static _fnCanvasReadyBind?: EventListener;
    private static _fnNodeDraggedBind?: EventListener;

    /**
     * @public
     * @static
     * @description Subscribes the manager to standard DOM and UI5 application events.
     * @param {EventBus} [oEventBus] - The application event bus for decoupled messaging.
     */
    public static attachEvents(oEventBus?: EventBus): void {
        if (this._bIsAttached) return;
        this._eventBus = oEventBus;

        if (this._eventBus) {
            this._eventBus.subscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this._onRenderRequest, this);
        }

        this._fnNodePinnedBind = this._onNodePinned.bind(this) as EventListener;
        this._fnUndoRequestBind = this._onUndoRequest.bind(this) as EventListener;
        this._fnCanvasReadyBind = this._onCanvasReady.bind(this) as EventListener;
        this._fnNodeDraggedBind = this._onNodeDragged.bind(this) as EventListener;

        if (typeof document !== "undefined") {
            document.addEventListener(DomEvents.NODE_PINNED, this._fnNodePinnedBind);
            document.addEventListener(DomEvents.UNDO_REQUEST, this._fnUndoRequestBind);
            document.addEventListener(DomEvents.CANVAS_READY, this._fnCanvasReadyBind);
            document.addEventListener(DomEvents.NODE_DRAGGED, this._fnNodeDraggedBind);
        }

        this._bIsAttached = true;
    }

    /**
     * @public
     * @static
     * @description Unbinds all listeners, clears timeouts, and explicitly closes the AudioContext to free memory.
     */
    public static detachEvents(): void {
        if (!this._bIsAttached) return;

        if (this._eventBus) {
            this._eventBus.unsubscribe(EventChannels.DIAGRAM_ENGINE, EventIds.RENDER_REQUEST, this._onRenderRequest, this);
        }

        if (typeof document !== "undefined") {
            if (this._fnNodePinnedBind) document.removeEventListener(DomEvents.NODE_PINNED, this._fnNodePinnedBind);
            if (this._fnUndoRequestBind) document.removeEventListener(DomEvents.UNDO_REQUEST, this._fnUndoRequestBind);
            if (this._fnCanvasReadyBind) document.removeEventListener(DomEvents.CANVAS_READY, this._fnCanvasReadyBind);
            if (this._fnNodeDraggedBind) document.removeEventListener(DomEvents.NODE_DRAGGED, this._fnNodeDraggedBind);
        }

        clearTimeout(this._iMuteFailsafeTimer);
        this._bMuteNextCanvasReady = false;

        if (this._audioCtx && this._audioCtx.state !== 'closed') {
            this._audioCtx.close().catch(() => {});
        }
        this._engine = null;
        this._audioCtx = null;
        this._bIsAttached = false;
    }

    /**
     * @private
     * @static
     * @description Checks if the user has enabled UI audio feedback via the global settings.
     * @returns {boolean} True if audio is enabled.
     */
    private static _isAudioEnabled(): boolean {
        return localStorage.getItem("vdmAudioEnabled") !== "false";
    }

    /**
     * @private
     * @static
     * @description Ensures the AudioContext is created and resumed synchronously.
     * This is required to satisfy modern browser autoplay policies, which require the context
     * to be unlocked within the same execution frame as a user gesture.
     * @returns {Promise<void>}
     */
    private static async _ensureAudioContext(): Promise<void> {
        if (!this._audioCtx) {
            const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
                this._audioCtx = new AudioCtxClass();
            }
        }
        
        if (this._audioCtx && this._audioCtx.state === 'suspended') {
            try {
                await this._audioCtx.resume();
            } catch (e) {
                console.warn("VDM Diagrammer: Could not resume AudioContext", e);
            }
        }
    }

    /**
     * @private
     * @static
     * @description Lazy-loads the procedural audio engine only when required.
     * Utilizes a native browser ES Module import bridge to bypass SAPUI5's AMD loader,
     * ensuring the sandboxed module classes are properly extracted without build-time middleware.
     * @returns {Promise<void>}
     */
    private static async _lazyInitEngine(): Promise<void> {
        if (this._engine || !this._isAudioEnabled()) return;

        try {
            await this._ensureAudioContext();
            
            const config = ConfigManager.get();
            
            const nativeImport = new Function('url', 'return import(url)');
            let rlo: any;
            
            try {
                const sLocalUrl = sap.ui.require.toUrl("nz/co/siliconstreet/vdmdiagrammer/lib/rlo-engine.min.js");
                rlo = await nativeImport(sLocalUrl);
            } catch (e) {
                console.warn("VDM Diagrammer: Local RLO Engine missing. Engaging CDN fallback...");
                rlo = await nativeImport((config.cdnPaths as any)?.rloEngine);
            }

            this._engine = new rlo.RLOGameEngine(this._audioCtx);
            this._engine.setSFXVolume(0.15); 
            console.log("VDM Diagrammer: Audio Engine initialized successfully.");
        } catch (e) {
            console.warn("VDM Diagrammer: Failed to initialize audio engine.", e);
        }
    }

    /**
     * @private
     * @static
     * @description Synthesizes a soft, digital chime when a new diagram generation begins.
     * @returns {Promise<void>}
     */
    private static async _onRenderRequest(): Promise<void> {
        if (!this._isAudioEnabled()) return;
        await this._ensureAudioContext();
        await this._lazyInitEngine();
        
        this._iLastRenderRequestTime = Date.now();
        if (this._engine) this._engine.playSFX(9, 261.63, 0.1, 0.05); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a confirming chime when the layout engine finishes rendering.
     * Includes an acoustic debounce to prevent double-chimes on rapid UI updates.
     * @returns {Promise<void>}
     */
    private static async _onCanvasReady(): Promise<void> {
        if (this._bMuteNextCanvasReady) {
            this._bMuteNextCanvasReady = false;
            clearTimeout(this._iMuteFailsafeTimer);
            return;
        }

        if (Date.now() - this._iLastRenderRequestTime < 800) return;

        if (!this._isAudioEnabled()) return;
        await this._ensureAudioContext();
        await this._lazyInitEngine();
        
        if (this._engine) this._engine.playSFX(9, 523.25, 0.2, 0.08); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a sharp, mechanical snap when a node is pinned.
     * @returns {Promise<void>}
     */
    private static async _onNodePinned(): Promise<void> {
        if (!this._isAudioEnabled()) return;
        await this._ensureAudioContext();
        await this._lazyInitEngine();
        
        if (this._engine) this._engine.playSFX(128, 800, 0.05, 0.15); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a soft, low thud when the layout is reverted.
     * Temporarily suppresses the 'Canvas Ready' chime to prevent acoustic stacking.
     * @returns {Promise<void>}
     */
    private static async _onUndoRequest(): Promise<void> {
        if (!this._isAudioEnabled()) return;
        
        this._bMuteNextCanvasReady = true;
        clearTimeout(this._iMuteFailsafeTimer);
        this._iMuteFailsafeTimer = setTimeout(() => { this._bMuteNextCanvasReady = false; }, 1500);

        await this._ensureAudioContext();
        await this._lazyInitEngine();
        
        if (this._engine) this._engine.playSFX(128, 50, 0.15, 0.08); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a subtle, organic wooden tick when a node is dropped.
     * @returns {Promise<void>}
     */
    private static async _onNodeDragged(): Promise<void> {
        if (!this._isAudioEnabled()) return;
        await this._ensureAudioContext();
        await this._lazyInitEngine();
        
        if (this._engine) this._engine.playSFX(128, 400, 0.04, 0.05); 
    }
}
