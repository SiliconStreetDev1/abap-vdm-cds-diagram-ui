/**
 * @fileoverview Manages UI Haptics and Audio Feedback.
 * @description Integrates RLO-Engine for procedural audio synthesis.
 * Operates as a decoupled observer to uphold the Single Responsibility Principle.
 */
import { EventManager } from "../events/EventManager";
import { Subscription } from "../events/Subscription";
import ConfigManager from "../renderer/ConfigManager";

export default class SoundscapeManager {
    private static engine: any = null;
    private static audioCtx: AudioContext | null = null;
    private static isAttached: boolean = false;
    private static subscriptions: Subscription[] = [];

    private static muteNextCanvasReady: boolean = false;
    private static muteFailsafeTimer?: ReturnType<typeof setTimeout>;
    private static lastRenderRequestTime: number = 0;

    /**
     * @public
     * @static
     * @description Subscribes the manager to the new unified EventManager.
     */
    public static attachEvents(): void {
        if (this.isAttached) return;

        const eventManager = EventManager.getInstance();

        this.subscriptions.push(
            eventManager.subscribe("diagram:renderRequest", this.onRenderRequest.bind(this)),
            eventManager.subscribe("canvas:nodePinned", this.onNodePinned.bind(this)),
            eventManager.subscribe("canvas:undoRequest", this.onUndoRequest.bind(this)),
            eventManager.subscribe("canvas:ready", this.onCanvasReady.bind(this)),
            eventManager.subscribe("canvas:nodeDragging", this.onNodeDragged.bind(this)),
            eventManager.subscribe("canvas:nodePositionChanged", this.onNodeDropped.bind(this))
        );

        this.isAttached = true;
    }

    /**
     * @public
     * @static
     * @description Unbinds all listeners explicitly via subscriptions, clears timeouts, and closes AudioContext.
     */
    public static detachEvents(): void {
        if (!this.isAttached) return;

        // Clean up explicit subscriptions
        this.subscriptions.forEach(sub => sub.dispose());
        this.subscriptions = [];

        clearTimeout(this.muteFailsafeTimer);
        this.muteNextCanvasReady = false;

        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            this.audioCtx.close().catch(() => {});
        }
        this.engine = null;
        this.audioCtx = null;
        this.isAttached = false;
    }

    /**
     * @private
     * @static
     * @description Checks if the user has enabled UI audio feedback via the global settings.
     * @returns {boolean} True if audio is enabled.
     */
    private static isAudioEnabled(): boolean {
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
    private static async ensureAudioContext(): Promise<void> {
        if (!this.audioCtx) {
            const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
                this.audioCtx = new AudioCtxClass();
            }
        }
        
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
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
    private static async lazyInitEngine(): Promise<void> {
        if (this.engine || !this.isAudioEnabled()) return;

        try {
            await this.ensureAudioContext();
            
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

            this.engine = new rlo.RLOGameEngine(this.audioCtx);
            this.engine.setSFXVolume(0.15); 
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
    private static async onRenderRequest(): Promise<void> {
        if (!this.isAudioEnabled()) return;
        await this.ensureAudioContext();
        await this.lazyInitEngine();
        
        this.lastRenderRequestTime = Date.now();
        if (this.engine) this.engine.playSFX(9, 261.63, 0.1, 0.05); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a confirming chime when the layout engine finishes rendering.
     * Includes an acoustic debounce to prevent double-chimes on rapid UI updates.
     * @returns {Promise<void>}
     */
    private static async onCanvasReady(): Promise<void> {
        if (this.muteNextCanvasReady) {
            this.muteNextCanvasReady = false;
            clearTimeout(this.muteFailsafeTimer);
            return;
        }

        if (Date.now() - this.lastRenderRequestTime < 800) return;

        if (!this.isAudioEnabled()) return;
        await this.ensureAudioContext();
        await this.lazyInitEngine();
        
        if (this.engine) this.engine.playSFX(9, 523.25, 0.2, 0.08); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a sharp, mechanical snap when a node is pinned.
     * @returns {Promise<void>}
     */
    private static async onNodePinned(): Promise<void> {
        if (!this.isAudioEnabled()) return;
        await this.ensureAudioContext();
        await this.lazyInitEngine();
        
        if (this.engine) this.engine.playSFX(128, 800, 0.05, 0.15); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a soft, low thud when the layout is reverted.
     * Temporarily suppresses the 'Canvas Ready' chime to prevent acoustic stacking.
     * @returns {Promise<void>}
     */
    private static async onUndoRequest(): Promise<void> {
        if (!this.isAudioEnabled()) return;
        
        this.muteNextCanvasReady = true;
        clearTimeout(this.muteFailsafeTimer);
        this.muteFailsafeTimer = setTimeout(() => { this.muteNextCanvasReady = false; }, 1500);

        await this.ensureAudioContext();
        await this.lazyInitEngine();
        
        if (this.engine) this.engine.playSFX(128, 50, 0.15, 0.08); 
    }

    private static lastDragSoundTime: number = 0;

    /**
     * @private
     * @static
     * @description Synthesizes a subtle, organic wooden tick when a node is dragged.
     * Includes a throttle to prevent audio engine saturation during high-framerate pointer moves.
     * @returns {Promise<void>}
     */
    private static async onNodeDragged(): Promise<void> {
        const now = Date.now();
        if (now - this.lastDragSoundTime < 80) return; // 80ms throttle (~12Hz)
        
        if (!this.isAudioEnabled()) return;
        
        // Don't await ensureAudioContext to prevent blocking the high-frequency UI thread
        if (!this.audioCtx || this.audioCtx.state === 'suspended') {
            this.ensureAudioContext();
            return;
        }

        this.lastDragSoundTime = now;
        
        if (this.engine) this.engine.playSFX(128, 400 + Math.random() * 50, 0.04, 0.05); 
    }

    /**
     * @private
     * @static
     * @description Synthesizes a slightly deeper snap when a node is dropped.
     * @returns {Promise<void>}
     */
    private static async onNodeDropped(): Promise<void> {
        if (!this.isAudioEnabled()) return;
        await this.ensureAudioContext();
        await this.lazyInitEngine();
        
        if (this.engine) this.engine.playSFX(128, 300, 0.06, 0.08); 
    }
}
