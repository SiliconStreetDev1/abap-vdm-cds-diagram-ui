import CountdownOverlay from "./CountdownOverlay";

/**
 * @interface IMediaRecorder
 * @description Strict interface for native browser video capture APIs
 */
export interface IMediaRecorder {
    state: string;
    start(timeslice?: number): void;
    stop(): void;
    pause(): void;
    resume(): void;
    ondataavailable: ((e: { data: Blob }) => void) | null;
    onstop: (() => void | Promise<void>) | null;
    onerror: ((e: any) => void) | null;
}

/**
 * @interface IRecordingConfig
 * @description Unified configuration payload for polymorphic recording execution.
 */
export interface IRecordingConfig {
    viewId: string;
    resolutionStr: string;
    fps: number;
    videoQuality?: string;
    delaySeconds: number;
    onWaitingForPermission?: () => void;
    onPermissionGranted?: () => void;
    onCountdown: (sec: number) => void;
    onStart: () => void;
    onStop: (blob: Blob) => void;
    onError: (err: string) => void;
    onTick: (time: number) => void;
    onWarning?: (msg: string) => void;
}

/**
 * @class VideoRecorder
 * @namespace nz.co.siliconstreet.vdmdiagrammer.video
 * @description Orchestrates MediaStream capture, time tracking, and encoding for video generation.
 */
export default abstract class VideoRecorder {
    protected mediaRecorder: IMediaRecorder | MediaRecorder | null = null;
    protected stream: MediaStream | null = null;
    
    protected recordedChunks: Blob[] = [];
    protected isActive: boolean = false;
    protected isPaused: boolean = false;
    protected isStarting: boolean = false;
    protected isCountingDown: boolean = false;
    protected lastViewId: string = "";
    
    protected subtitleTitle: string = "";
    protected subtitleDesc: string = "";
    
    protected timeoutId: number | null = null;
    protected maxDurationMs = 150000; // 2 minutes and 30 seconds
    protected totalElapsedMs: number = 0;
    protected lastTickTime: number = 0;
    protected cancelDelayCallback?: () => void;

    /**
     * @public
     * @description Concrete execution entrypoint. Enforces strict concurrency Mutex locks,
     * memory sanitation, and error routing for all subclass engines. (Template Method Pattern)
     * @param {IRecordingConfig} config - Unified settings payload.
     */
    public async start(config: IRecordingConfig): Promise<void> {
        if (this.isStarting || this.isActive) return;
        
        this.stopRecording();
        this.cleanupMemory(); // Synchronous wipe to prevent async race conditions
        this.isStarting = true;

        try {
            await this.performCapture(config);
            
            // Template Method: Automatically enforce post-capture success invariants
            if (this.isStarting) { 
                this.isActive = true;
                this.isStarting = false;
                this.startTrackingTimer(config);
            }
        } catch (e: any) {
            this.isStarting = false;
            this.cleanupMemory();
            // Suppress internal execution aborts gracefully
            if (e.message !== "ABORT") {
                config.onError(e.message || "Failed to start recording.");
            }
        }
    }

    /**
     * @protected
     * @description Abstract capture hook to be implemented by targeted subclass engines.
     * @param {IRecordingConfig} config - Unified settings payload.
     */
    protected abstract performCapture(config: IRecordingConfig): Promise<void>;

    /**
     * @public
     * @description Sets the maximum duration limit for the recording to prevent indefinite capture.
     * @param {number} ms - Maximum duration in milliseconds.
     */
    public setMaxDuration(ms: number): void {
        this.maxDurationMs = ms;
    }

    /**
     * @public
     * @description Sets the subtitle text to be burned into the video output.
     * @param {string} title - The main title text.
     * @param {string} desc - The descriptive text.
     */
    public setSubtitles(title: string, desc: string): void {
        this.subtitleTitle = title;
        this.subtitleDesc = desc;
    }

    /**
     * @public
     * @description Exposes the current recording state of the engine.
     * @returns {boolean} True if the engine is actively capturing frames.
     */
    public isRecording(): boolean { 
        return this.isActive; 
    }

    /**
     * @private
     * @description Executes a strictly bound asynchronous delay loop. Allows cancellation mid-tick.
     */
    protected async delayLoop(seconds: number, viewId: string, onCountdownTick: (s: number) => void): Promise<boolean> {
        this.isCountingDown = true;
        for (let i = seconds; i > 0; i--) {
            if (!this.isCountingDown) {
                CountdownOverlay.hide(viewId);
                return false;
            }
            onCountdownTick(i);
            CountdownOverlay.show(i, viewId);
            await new Promise<void>(resolve => {
                let timer = window.setTimeout(resolve, 1000);
                this.cancelDelayCallback = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
        }
        CountdownOverlay.hide(viewId);
        this.isCountingDown = false;
        return true;
    }

    /**
     * @private
     * @description Calculates an optimal encoding bitrate mathematically based on target resolution and framerate.
     * Prevents pixelation on 4K/60FPS captures while conserving memory on 720p/30FPS captures.
     */
    protected calculateDynamicBitrate(width: number, height: number, fps: number, quality: string = "HIGH"): number {
        // Bits Per Pixel (BPP) Compression Target
        let bpp = 0.2; // HIGH
        switch (quality.toUpperCase()) {
            case "LOW": bpp = 0.05; break;
            case "MEDIUM": bpp = 0.1; break;
            case "HIGH": bpp = 0.2; break;
            case "ULTRA": bpp = 0.4; break;
        }
        
        // Formula: Width * Height * FPS * BitsPerPixel
        const pixelsPerFrame = width * height;
        const bitsPerSecond = pixelsPerFrame * fps * bpp;
        return Math.max(1000000, Math.min(bitsPerSecond, 20000000)); // Clamp between 1 Mbps and 20 Mbps (Protects RAM Buffer)
    }

    /**
     * @private
     * @description Fallback chain to find the optimal MIME type for encoding depending on browser support.
     */
    protected getOptimalMimeType(): string {
        if (typeof MediaRecorder !== 'undefined') {
            // Enterprise Fix: Prioritize WebM with VP8 or VP9.
            // Running MediaRecorder in native "Buffered Mode" (by omitting the timeslice)
            // allows Chromium to generate a flawless 'Cues' timeline index natively on stop.
            if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) return 'video/webm; codecs=vp8';
            if (MediaRecorder.isTypeSupported('video/webm; codecs=h264')) return 'video/webm; codecs=h264';
            if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) return 'video/webm; codecs=vp9';
            if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
            if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4'; // Absolute fallback for Safari
        }
        return '';
    }

    /**
     * @protected
     * @description Starts the internal timer to track elapsed recording duration.
     * @param {IRecordingConfig} config - The active configuration to dispatch tick and warning events.
     */
    protected startTrackingTimer(config: IRecordingConfig): void {
        this.totalElapsedMs = 0;
        this.lastTickTime = performance.now();
        let bWarningShown = false;

        this.timeoutId = window.setInterval(() => {
            if (this.isPaused) {
                // We no longer advance the tick time here, as pauseRecording() handles 
                // the fractional capture and we want the timer frozen.
                return;
            }
            const now = performance.now();
            this.totalElapsedMs += (now - this.lastTickTime);
            this.lastTickTime = now;
            config.onTick(this.totalElapsedMs);

            const remainingMs = this.maxDurationMs - this.totalElapsedMs;
            
            // ENTERPRISE FIX: Provide a 10-second early warning before the system forcefully kills the recording
            if (remainingMs <= 10000 && remainingMs > 0 && !bWarningShown) {
                bWarningShown = true;
                if (config.onWarning) {
                    config.onWarning(`Maximum recording limit approaching. Auto-saving in ${Math.ceil(remainingMs / 1000)} seconds.`);
                }
            }

            if (this.totalElapsedMs >= this.maxDurationMs) this.stopRecording();
        }, 1000) as unknown as number;
    }

    /**
     * @protected
     * @description Standardizes the instantiation and event binding of the native MediaRecorder.
     * Enforces an identical, memory-safe compilation pipeline for all subclass engines.
     */
    protected startMediaRecorder(config: IRecordingConfig, dynamicBitrate: number): void {
        if (!this.stream) throw new Error("Cannot start MediaRecorder without an active stream.");

        const sMimeType = this.getOptimalMimeType();
        const options: any = { videoBitsPerSecond: Math.round(dynamicBitrate) };
        if (sMimeType) options.mimeType = sMimeType;

        try {
            this.mediaRecorder = new window.MediaRecorder(this.stream, options) as IMediaRecorder;
        } catch (e) {
            this.mediaRecorder = new window.MediaRecorder(this.stream) as IMediaRecorder;
        }

        this.recordedChunks = [];
        this.mediaRecorder.ondataavailable = (ev: any) => { if (ev.data && ev.data.size > 0) this.recordedChunks.push(ev.data); };
        this.mediaRecorder.onstop = () => this.finalizeRecording(config);
        this.mediaRecorder.onerror = (e: any) => {
            config.onError("Hardware encoder error: " + (e.error ? e.error.message : "Unknown"));
            this.cleanupMemory();
        };
        
        this.mediaRecorder.start(); 
    }

    /**
     * @protected
     * @description Shared Blob compilation routine ensuring all subclass recordings finalize identically.
     */
    protected async finalizeRecording(config: IRecordingConfig): Promise<void> {
        this.isActive = false;
        
        // Ensure the exact fraction of a second is captured for flawless metadata injection
        if (!this.isPaused && this.lastTickTime > 0) {
            this.totalElapsedMs += (performance.now() - this.lastTickTime);
        }

        const actualMimeType = this.mediaRecorder && (this.mediaRecorder as any).mimeType ? (this.mediaRecorder as any).mimeType.split(';')[0] : 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: actualMimeType });
        
        config.onStop(blob);
        this.cleanupMemory();
    }

    /**
     * @public
     * @description Aborts or finalizes the active recording, releasing all hardware locks.
     */
    public stopRecording(): void {
        this.isStarting = false; // Immediately release the lock if the user cancels
        
        // Try to retrieve the active View ID safely to cleanup any UI popups
        const viewId = this.lastViewId;
        
        if (this.isCountingDown) {
            this.isCountingDown = false;
            if (this.cancelDelayCallback) this.cancelDelayCallback();
        }
        if (viewId) CountdownOverlay.hide(viewId);
        if (this.mediaRecorder && (this.mediaRecorder.state === "recording" || this.mediaRecorder.state === "paused")) {
            this.mediaRecorder.stop();
        }
        this.isActive = false;
        this.isPaused = false;
    }

    /**
     * @public
     * @description Safely halts internal engine compositing without triggering MediaRecorder exceptions.
     */
    public systemPause(): void {
        this.pauseRecording();
    }

    /**
     * @public
     * @description Resumes internal engine compositing after a system pause.
     */
    public systemResume(): void {
        this.resumeRecording();
    }

    /**
     * @public
     * @description Pauses the native MediaRecorder instance.
     */
    public pauseRecording(): void {
        try {
            if (this.mediaRecorder && this.mediaRecorder.state === "recording") this.mediaRecorder.pause();
        } catch (e) {
            console.warn("MediaRecorder pause failed:", e);
        }
        
        // ENTERPRISE FIX: Capture fractional elapsed time before entering the paused state.
        // Ensures duration metadata accurately reflects all recorded frames to prevent seeking corruption.
        if (!this.isPaused && this.lastTickTime > 0) {
            this.totalElapsedMs += (performance.now() - this.lastTickTime);
        }
        
        this.isPaused = true;
    }

    /**
     * @public
     * @description Resumes the native MediaRecorder instance.
     */
    public resumeRecording(): void {
        try {
            if (this.mediaRecorder && this.mediaRecorder.state === "paused") this.mediaRecorder.resume();
        } catch (e) {
            console.warn("MediaRecorder resume failed:", e);
        }
        this.isPaused = false;
        this.lastTickTime = performance.now();
    }

    /**
     * @protected
     * @description Wipes active streams, clears timeouts, and severs closure bindings to prevent GC memory leaks.
     */
    protected cleanupMemory(): void {
        this.isStarting = false;
        const viewId = this.lastViewId;
        if (viewId) CountdownOverlay.hide(viewId);
        
        // Release MediaRecorder event listeners to break closure memory rings
        if (this.mediaRecorder) {
            this.mediaRecorder.ondataavailable = null;
            this.mediaRecorder.onstop = null;
            this.mediaRecorder.onerror = null;
            this.mediaRecorder = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.onended = null; // Prevent lingering closure executions
                track.stop();
            });
            this.stream = null;
        }
        this.recordedChunks = [];
        
        if (this.timeoutId !== null) { window.clearInterval(this.timeoutId); this.timeoutId = null; }
        this.isActive = false;
        this.isPaused = false;
        this.cancelDelayCallback = undefined;
    }
}
