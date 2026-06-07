/**
 * @fileoverview Manages UI Haptics and Audio Feedback.
 * @description Integrates RLO-Engine for procedural audio synthesis.
 * Operates as a decoupled observer to uphold the Single Responsibility Principle.
 */
import { EventManager } from "../events/EventManager";
import { Subscription } from "../events/Subscription";
import ConfigManager from "../renderer/ConfigManager";
import { StorageKeys } from "../constants/StorageConstants";

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
            eventManager.subscribe("diagram:renderRequest", this.onRenderRequest.bind(this), { attachEventOnce: () => {} }),
            eventManager.subscribe("canvas:ready", this.onCanvasReady.bind(this), { attachEventOnce: () => {} })
        );

        // ENTERPRISE FIX: The ultimate Autoplay Policy resolution.
        // UI5's EventProvider notoriously delays synthetic `press` events to the next microtask or setTimeout queue.
        // This strips the native browser "user gesture" context, causing Safari/Chrome to firmly reject Web Audio API resumes.
        // We bypass UI5 entirely by attaching a one-time native global capture listener to the document.
        const fnUnlock = () => {
            this.unlockAudio();
            document.removeEventListener("click", fnUnlock, true);
            document.removeEventListener("touchstart", fnUnlock, true);
            document.removeEventListener("keydown", fnUnlock, true);
        };

        if (typeof document !== "undefined") {
            document.addEventListener("click", fnUnlock, true);
            document.addEventListener("touchstart", fnUnlock, { capture: true, passive: true });
            document.addEventListener("keydown", fnUnlock, true);
        }

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
        return localStorage.getItem(StorageKeys.AUDIO_ENABLED) !== "false";
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
     * @public
     * @static
     * @description Public hook to explicitly unlock the AudioContext during a direct user gesture.
     * Prevents the browser Autoplay Policy from blocking sounds triggered asynchronously later.
     */
    public static unlockAudio(): void {
        if (!this.isAudioEnabled()) return;
        
        // ENTERPRISE FIX: Everything MUST happen synchronously in the exact same call stack as the physical click.
        // We cannot use await or .then(), otherwise the browser execution frame shifts to a microtask, stripping the user gesture context.
        
        if (!this.audioCtx) {
            const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
                this.audioCtx = new AudioCtxClass();
            }
        }

        if (this.audioCtx) {
            try {
                // Instantly play a silent dummy sound in the synchronous stack
                const osc = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                gain.gain.value = 0;
                osc.connect(gain);
                gain.connect(this.audioCtx.destination);
                osc.start(0);
                osc.stop(this.audioCtx.currentTime + 0.001);
                
                // Fire and forget the resume command (DO NOT AWAIT)
                if (this.audioCtx.state === 'suspended') {
                    this.audioCtx.resume().catch(() => {});
                }
            } catch (e) {
                // Ignore errors
            }
        }
            
        // Pre-fetch the procedural engine script so it's instantly ready for the first real sound
        this.lazyInitEngine();
    }

    private static engineInitPromise: Promise<void> | null = null;

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

        // ENTERPRISE FIX: Memoize the initialization Promise.
        // Prevents a race condition where the rapid synchronous unlockAudio() call 
        // and the asynchronous onRenderRequest() call spawn duplicate concurrent network fetches,
        // which causes the engine to overwrite itself mid-initialization and drop the first sound.
        if (this.engineInitPromise) {
            return this.engineInitPromise;
        }

        this.engineInitPromise = (async () => {
            try {
                // ENTERPRISE FIX: Must await initialize() instead of synchronous get().
                // If the user clicks the document immediately on page load, get() returns an empty object 
                // and aborts the pre-fetch. We must wait for the config to fully resolve.
                const config = await ConfigManager.initialize();
                
                const nativeImport = new Function('url', 'return import(url)');
                let rlo: any;
                
                try {
                    let sLocalUrl = config.localPaths?.rloEngine;
                    if (sLocalUrl && sLocalUrl.startsWith("./")) {
                        const sModulePath = "nz/co/siliconstreet/vdmdiagrammer/" + sLocalUrl.substring(2);
                        sLocalUrl = sap.ui.require.toUrl(sModulePath);
                    }
                    if (!sLocalUrl) throw new Error("No local path configured for rloEngine");
                    
                    rlo = await nativeImport(sLocalUrl);
                } catch (e) {
                    const cdnPath = (config.cdnPaths as any)?.rloEngine;
                    if (!cdnPath) return; // Silent exit if no CDN fallback available
                    rlo = await nativeImport(cdnPath);
                }

                if (rlo && rlo.RLOGameEngine) {
                    this.engine = new rlo.RLOGameEngine(this.audioCtx);
                    this.engine.setSFXVolume(0.15); 
                }
            } catch (e) {
                // Silently suppress audio initialization errors to keep the console clean
            } finally {
                this.engineInitPromise = null;
            }
        })();

        return this.engineInitPromise;
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

    /**
     * @public
     * @static
     * @description Exposes the internal synthesizer so decoupled plugins can trigger sounds without managing AudioContext.
     */
    public static async playSFX(waveform: number, frequency: number, volume: number, duration: number): Promise<void> {
        if (!this.isAudioEnabled()) return;
        
        if (!this.audioCtx || this.audioCtx.state === 'suspended') {
            await this.ensureAudioContext();
            await this.lazyInitEngine();
        }

        if (this.engine) {
            // RLO-Engine signature: playSFX(instrumentId, freq, duration, velocity)
            // 'velocity' determines the note's amplitude/volume in MIDI-style synthesis
            this.engine.playSFX(waveform, frequency, duration, volume);
        }
    }
}
