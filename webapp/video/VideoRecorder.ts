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
}

/**
 * @interface IRecordingConfig
 * @description Unified configuration payload for polymorphic recording execution.
 */
export interface IRecordingConfig {
    resolutionStr: string;
    fps: number;
    delaySeconds: number;
    onWaitingForPermission?: () => void;
    onPermissionGranted?: () => void;
    onCountdown: (sec: number) => void;
    onStart: () => void;
    onStop: (blob: Blob) => void;
    onError: (err: string) => void;
    onTick: (time: number) => void;
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
                this.startTrackingTimer(config.onTick);
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
    protected async delayLoop(seconds: number, onCountdownTick: (s: number) => void): Promise<boolean> {
        this.isCountingDown = true;
        for (let i = seconds; i > 0; i--) {
            if (!this.isCountingDown) {
                CountdownOverlay.hide();
                return false;
            }
            onCountdownTick(i);
            CountdownOverlay.show(i);
            await new Promise<void>(resolve => {
                let timer = window.setTimeout(resolve, 1000);
                this.cancelDelayCallback = () => {
                    clearTimeout(timer);
                    resolve();
                };
            });
        }
        CountdownOverlay.hide();
        this.isCountingDown = false;
        return true;
    }

    /**
     * @private
     * @description Calculates an optimal encoding bitrate mathematically based on target resolution and framerate.
     * Prevents pixelation on 4K/60FPS captures while conserving memory on 720p/30FPS captures.
     */
    protected calculateDynamicBitrate(width: number, height: number, fps: number): number {
        // Formula: Width * Height * FPS * BitsPerPixel (Targeting 0.1 BPP for high-fidelity enterprise diagrams)
        const pixelsPerFrame = width * height;
        const bitsPerSecond = pixelsPerFrame * fps * 0.1;
        return Math.max(2500000, Math.min(bitsPerSecond, 50000000)); // Clamp between 2.5 Mbps and 50 Mbps
    }

    /**
     * @private
     * @description Fallback chain to find the optimal MIME type for encoding depending on browser support.
     */
    protected getOptimalMimeType(): string {
        if (typeof MediaRecorder !== 'undefined') {
            // Enterprise Fix: Prioritize WebM with VP8.
            // 1. Fragmented MP4s (video/mp4) generated by Chrome are natively UNSEEKABLE in desktop players 
            //    because they lack a central 'moov' atom. Prioritizing MP4 breaks local file scrubbing.
            // 2. VP9 aggressively drops keyframes on static UI screens. VP8 combined with start(1000) 
            //    forces a new WebM Cluster and Keyframe every 1 second, allowing fix-webm-duration 
            //    to build a flawless 'Cues' timeline index for smooth fast-forwarding.
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
     * @param {function} onTick - Callback executed every second with the total elapsed time.
     */
    protected startTrackingTimer(onTick: (time: number) => void): void {
        this.totalElapsedMs = 0;
        this.lastTickTime = Date.now();
        this.timeoutId = window.setInterval(() => {
            if (this.isPaused) {
                // We no longer advance the tick time here, as pauseRecording() handles 
                // the fractional capture and we want the timer frozen.
                return;
            }
            const now = Date.now();
            this.totalElapsedMs += (now - this.lastTickTime);
            this.lastTickTime = now;
            onTick(this.totalElapsedMs);
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
        
        this.mediaRecorder.start(1000); 
    }

    /**
     * @protected
     * @description Shared Blob compilation routine ensuring all subclass recordings finalize identically.
     */
    protected async finalizeRecording(config: IRecordingConfig): Promise<void> {
        this.isActive = false;
        
        // Ensure the exact fraction of a second is captured for flawless metadata injection
        if (!this.isPaused && this.lastTickTime > 0) {
            this.totalElapsedMs += (Date.now() - this.lastTickTime);
        }

        const actualMimeType = this.mediaRecorder && (this.mediaRecorder as any).mimeType ? (this.mediaRecorder as any).mimeType.split(';')[0] : 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: actualMimeType });
        
        // ENTERPRISE FIX: Deep Binary Metadata Injection for WebM files.
        // Chromium's MediaRecorder streams WebM files linearly without a 'Cues' index or 'Duration'.
        // Without Cues, external desktop players (VLC, MPC-HC) crash or jump back to 0:00 when fast-forwarding.
        // tsEBML reads the binary buffer, identifies Keyframes, and injects a perfect Cues index.
        if (actualMimeType.includes("webm") && typeof (window as any).tsEBML !== "undefined") {
            try {
                const tsEBML = (window as any).tsEBML;
                const reader = new tsEBML.Reader();
                const decoder = new tsEBML.Decoder();
                
                const arrayBuffer = await blob.arrayBuffer();
                const elms = decoder.decode(arrayBuffer);
                elms.forEach((elm: any) => reader.read(elm));
                reader.stop();

                const refinedMetadataBuf = tsEBML.tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues);
                const body = arrayBuffer.slice(reader.metadataSize);
                const fixedBlob = new Blob([refinedMetadataBuf, body], { type: blob.type });

                config.onStop(fixedBlob);
                this.cleanupMemory();
            } catch (e: any) {
                console.warn("tsEBML binary parsing failed. Video may not be seekable in external players.", e);
                config.onStop(blob);
                this.cleanupMemory();
            }
        } else {
            config.onStop(blob);
            this.cleanupMemory();
        }
    }

    /**
     * @public
     * @description Aborts or finalizes the active recording, releasing all hardware locks.
     */
    public stopRecording(): void {
        this.isStarting = false; // Immediately release the lock if the user cancels
        if (this.isCountingDown) {
            this.isCountingDown = false;
            if (this.cancelDelayCallback) this.cancelDelayCallback();
        }
        CountdownOverlay.hide();
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
        // Overridden by subclasses to safely halt internal engines without touching the MediaRecorder
    }

    /**
     * @public
     * @description Resumes internal engine compositing after a system pause.
     */
    public systemResume(): void {
        // Overridden by subclasses
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
            this.totalElapsedMs += (Date.now() - this.lastTickTime);
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
        this.lastTickTime = Date.now();
    }

    /**
     * @protected
     * @description Wipes active streams, clears timeouts, and severs closure bindings to prevent GC memory leaks.
     */
    protected cleanupMemory(): void {
        this.isStarting = false;
        CountdownOverlay.hide();
        
        // Release MediaRecorder event listeners to break closure memory rings
        if (this.mediaRecorder) {
            this.mediaRecorder.ondataavailable = null;
            this.mediaRecorder.onstop = null;
            this.mediaRecorder = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.recordedChunks = [];
        
        if (this.timeoutId !== null) { window.clearInterval(this.timeoutId); this.timeoutId = null; }
        if (this.keyframeIntervalId !== null) { window.clearInterval(this.keyframeIntervalId); this.keyframeIntervalId = null; }
        this.isActive = false;
        this.isPaused = false;
    }
}