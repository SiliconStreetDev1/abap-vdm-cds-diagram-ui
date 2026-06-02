import SubtitleEngine from "./SubtitleEngine";

/**
 * @interface IMediaRecorder
 * @description Strict interface for native browser video capture APIs
 */
interface IMediaRecorder {
    state: string;
    start(timeslice?: number): void;
    stop(): void;
    pause(): void;
    resume(): void;
    ondataavailable: ((e: { data: Blob }) => void) | null;
    onstop: (() => void) | null;
}

/**
 * @interface IStreamCanvas
 * @description Safely extends native HTMLCanvasElement for WebGL media capture.
 */
interface IStreamCanvas extends HTMLCanvasElement {
    captureStream(frameRate?: number): MediaStream;
}

/**
 * @class VideoRecorder
 * @namespace nz.co.siliconstreet.vdmdiagrammer.video
 * @description Captures multi-layered WebGL canvases into a single, high-fidelity video stream.
 */
export default class VideoRecorder {
    private _mediaRecorder: IMediaRecorder | null = null;
    private _screenRecorder: MediaRecorder | null = null;
    private _screenStream: MediaStream | null = null;
    private _recordedChunks: Blob[] = [];
    private _rafId: number | null = null;
    private _compositeCanvas: HTMLCanvasElement | null = null;
    private _isActive: boolean = false;
    private _subtitleTitle: string = "";
    private _subtitleDesc: string = "";
    private _iTimeoutId: number | null = null;
    private readonly _iMaxDuration = 150000; // 2 minutes and 30 seconds
    private _isPaused: boolean = false;
    private _iTotalElapsed: number = 0;
    private _iLastTickTime: number = 0;

    public setSubtitles(title: string, desc: string): void {
        this._subtitleTitle = title;
        this._subtitleDesc = desc;
    }

    public calculateResolution(container: HTMLElement, resSetting: string): { w: number, h: number } {
        const sourceCanvases = container.getElementsByTagName("canvas");
        const baseW = sourceCanvases.length > 0 ? (sourceCanvases[0].width || container.clientWidth) : container.clientWidth;
        const baseH = sourceCanvases.length > 0 ? (sourceCanvases[0].height || container.clientHeight) : container.clientHeight;
        
        let targetW = baseW;
        let targetH = baseH;
        
        switch (resSetting.toUpperCase()) {
            case "1080P": targetW = 1920; targetH = 1080; break;
            case "1440P": targetW = 2560; targetH = 1440; break;
            case "4K": targetW = 3840; targetH = 2160; break;
            case "720P": targetW = 1280; targetH = 720; break;
        }
        return {
            w: targetW % 2 === 0 ? targetW : targetW + 1,
            h: targetH % 2 === 0 ? targetH : targetH + 1
        };
    }

    public async startScreenRecording(sResolution: string, fnOnStop: (blob: Blob) => void, fnOnError: (err: string) => void, fnOnTick: (time: number) => void): Promise<void> {
        this.stopRecording();
        try {
            let videoConstraints: boolean | MediaTrackConstraints = true;
            if (sResolution === "1080P") videoConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } };
            else if (sResolution === "720P") videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };

            this._screenStream = await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints, audio: false });
            
            // ENTERPRISE FIX: Safari fallback for MediaRecorder. Not all browsers support webm.
            let sMimeType = 'video/webm; codecs=vp9';
            if (!MediaRecorder.isTypeSupported(sMimeType)) sMimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(sMimeType)) sMimeType = 'video/mp4'; // Apple ecosystem fallback
            if (!MediaRecorder.isTypeSupported(sMimeType)) sMimeType = ''; // Let browser choose default
            
            this._screenRecorder = sMimeType ? new MediaRecorder(this._screenStream, { mimeType: sMimeType }) : new MediaRecorder(this._screenStream);
            this._recordedChunks = [];

            this._screenRecorder.ondataavailable = (e: BlobEvent) => { if (e.data && e.data.size > 0) this._recordedChunks.push(e.data); };
            this._screenRecorder.onstop = () => {
                const sActualType = this._screenRecorder?.mimeType ? this._screenRecorder.mimeType.split(';')[0] : 'video/webm';
                const blob = new Blob(this._recordedChunks, { type: sActualType });
                fnOnStop(blob);
                this._cleanup();
            };
            
            const aVideoTracks = this._screenStream.getVideoTracks();
            if (aVideoTracks && aVideoTracks.length > 0) {
                aVideoTracks[0].onended = () => this.stopRecording();
            }
            
            this._screenRecorder.start(1000);
            this._isActive = true;
            this._startTimer(fnOnTick);
            
        } catch (e: any) {
            fnOnError(e.message || "Failed to start screen recording");
        }
    }

    public startCanvasRecording(containerId: string, sResolution: string, fnOnStop: (blob: Blob) => void, fnOnError: (err: string) => void, fnOnTick: (time: number) => void): void {
        this.stopRecording(); 
        this._cleanup(); // Synchronous wipe to prevent async race conditions from old recordings

        const container = document.getElementById(containerId);
        if (!container) {
            fnOnError("Canvas container not found.");
            return;
        }

        const sourceCanvases = container.getElementsByTagName("canvas");
        if (sourceCanvases.length === 0) {
            fnOnError("No WebGL canvas found to record.");
            return;
        }

        const res = this.calculateResolution(container, sResolution);
        const targetW = res.w;
        const targetH = res.h;

        this._compositeCanvas = document.createElement("canvas");
        this._compositeCanvas.width = targetW;
        this._compositeCanvas.height = targetH;
        const ctx = this._compositeCanvas.getContext("2d");
        if (!ctx) return;

        // UX ARCHITECTURE: Auto-detect Fiori Dark/Light Theme for the background
        const isDarkTheme = document.body.classList.contains("sapTheme-sap_horizon_dark");
        const bgColor = isDarkTheme ? "#12171c" : "#f2f4f6";
        
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetW, targetH);
        
        // ARCHITECTURE FIX: Fiori FlexibleColumnLayout relies on strict viewport boundaries.
        // We use position fixed to prevent flexbox squashing. 
        // ENTERPRISE FIX: We keep it at top: 0 to prevent WebKit "Occlusion Culling" from freezing the video,
        // but we use clip-path to make it completely invisible to the user.
        this._compositeCanvas.style.position = "fixed";
        this._compositeCanvas.style.top = "0px";
        this._compositeCanvas.style.left = "0px";
        this._compositeCanvas.style.pointerEvents = "none";
        this._compositeCanvas.style.opacity = "0.01";
        this._compositeCanvas.style.zIndex = "-9999";
        this._compositeCanvas.style.clipPath = "inset(100%)";
        document.body.appendChild(this._compositeCanvas);

        this._isActive = true; 
        
        let liveContainer = document.getElementById(containerId);
        let liveCanvases = liveContainer ? liveContainer.getElementsByTagName("canvas") : null;

        const drawFrame = () => {
            if (!this._compositeCanvas || !this._isActive) return;
            
            // CPU PERFORMANCE FIX: Halt DOM queries and WebGL copying while paused or loading
            if (!this._isPaused) {
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, targetW, targetH);
                
                // DYNAMIC DOM HOOK: Only query the DOM if Fiori physically destroyed the container (Drill-Down).
                // This eliminates 60 DOM queries per second, drastically reducing CPU load.
                if (!liveContainer || !liveContainer.isConnected) {
                    liveContainer = document.getElementById(containerId);
                    liveCanvases = liveContainer ? liveContainer.getElementsByTagName("canvas") : null;
                }
                
                if (liveCanvases) {
                    for (let i = 0; i < liveCanvases.length; i++) {
                        const srcCvs = liveCanvases[i];
                        const srcW = srcCvs.width;
                        const srcH = srcCvs.height;
                        if (srcW === 0 || srcH === 0) continue;
                        
                        const drawScale = Math.min(targetW / srcW, targetH / srcH);
                        const drawW = srcW * drawScale;
                        const drawH = srcH * drawScale;
                        const drawX = (targetW - drawW) / 2;
                        const drawY = (targetH - drawH) / 2;
                        
                        ctx.drawImage(srcCvs, drawX, drawY, drawW, drawH);
                    }
                }
                
                SubtitleEngine.burn(ctx, targetW, targetH, this._subtitleTitle, this._subtitleDesc);
            }
            this._rafId = requestAnimationFrame(drawFrame);
        };
        drawFrame(); 

        try {
            const stream = (this._compositeCanvas as IStreamCanvas).captureStream(30);
            this._recordedChunks = [];

            try {
                const options = { mimeType: 'video/webm', videoBitsPerSecond: 16000000 };
                this._mediaRecorder = new window.MediaRecorder(stream, options) as IMediaRecorder;
            } catch (e) {
                try {
                    this._mediaRecorder = new window.MediaRecorder(stream, { mimeType: 'video/mp4' }) as IMediaRecorder;
                } catch (e2) {
                    this._mediaRecorder = new window.MediaRecorder(stream) as IMediaRecorder;
                }
            }
        
            this._mediaRecorder.ondataavailable = (ev: any) => { if (ev.data && ev.data.size > 0) this._recordedChunks.push(ev.data); };
            
            const localCanvasRef = this._compositeCanvas; // Closure to prevent async overwrites
            this._mediaRecorder.onstop = () => {
                this._isActive = false;
                if (this._rafId !== null) cancelAnimationFrame(this._rafId);
                if (localCanvasRef && localCanvasRef.parentNode) {
                    localCanvasRef.parentNode.removeChild(localCanvasRef);
                }
                const sActualType = this._mediaRecorder && (this._mediaRecorder as any).mimeType ? (this._mediaRecorder as any).mimeType.split(';')[0] : 'video/webm';
                const blob = new Blob(this._recordedChunks, { type: sActualType });
                fnOnStop(blob);
                this._cleanup();
            };
        
            this._mediaRecorder.start(1000); 
            this._startTimer(fnOnTick);
        } catch (e: any) {
            this._cleanup();
            fnOnError("Browser engine does not support Canvas Stream Capture.");
        }
    }

    private _startTimer(fnOnTick: (time: number) => void): void {
        this._iTotalElapsed = 0;
        this._iLastTickTime = Date.now();
        this._iTimeoutId = window.setInterval(() => {
            if (this._isPaused) {
                this._iLastTickTime = Date.now();
                return;
            }
            const iNow = Date.now();
            this._iTotalElapsed += (iNow - this._iLastTickTime);
            this._iLastTickTime = iNow;
            fnOnTick(this._iTotalElapsed);
            if (this._iTotalElapsed >= this._iMaxDuration) this.stopRecording();
        }, 1000) as unknown as number;
    }

    public stopRecording(): void {
        if (this._screenRecorder && (this._screenRecorder.state === "recording" || this._screenRecorder.state === "paused")) {
            this._screenRecorder.stop();
        }
        if (this._mediaRecorder && (this._mediaRecorder.state === "recording" || this._mediaRecorder.state === "paused")) {
            this._mediaRecorder.stop();
        }
        this._isActive = false;
        this._isPaused = false;
    }

    public pauseRecording(): void {
        if (this._screenRecorder && this._screenRecorder.state === "recording") this._screenRecorder.pause();
        if (this._mediaRecorder && this._mediaRecorder.state === "recording") this._mediaRecorder.pause();
        this._isPaused = true;
    }

    public resumeRecording(): void {
        if (this._screenRecorder && this._screenRecorder.state === "paused") this._screenRecorder.resume();
        if (this._mediaRecorder && this._mediaRecorder.state === "paused") this._mediaRecorder.resume();
        this._isPaused = false;
        this._iLastTickTime = Date.now();
    }

    private _cleanup(): void {
        if (this._screenStream) {
            this._screenStream.getTracks().forEach(t => t.stop());
            this._screenStream = null;
        }
        if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        if (this._compositeCanvas && this._compositeCanvas.parentNode) { this._compositeCanvas.parentNode.removeChild(this._compositeCanvas); this._compositeCanvas = null; }
        if (this._iTimeoutId !== null) { window.clearInterval(this._iTimeoutId); this._iTimeoutId = null; }
        this._isActive = false;
        this._isPaused = false;
    }

    public isRecording(): boolean { return this._isActive; }
}