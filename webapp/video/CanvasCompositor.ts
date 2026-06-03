/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.video
 * @fileoverview Handles WebGL to Canvas compositing, scaling, and background injection for video capture.
 * @description Safely encapsulates CPU-heavy requestAnimationFrame loops and Canvas 2D drawings.
 */
import SubtitleEngine from "./SubtitleEngine";

export interface IStreamCanvas extends HTMLCanvasElement {
    captureStream(frameRate?: number): MediaStream;
}

export default class CanvasCompositor {
    private compositeCanvas: HTMLCanvasElement | null = null;
    private rafId: number | null = null;
    private isActive: boolean = false;
    private isPaused: boolean = false;
    private sourceCanvases: HTMLCanvasElement[] = [];

    /**
     * @public
     * @description Explicitly queries the DOM for active canvases. Avoids HTMLCollection thrashing.
     */
    public updateTarget(containerId: string): void {
        const liveContainer = document.getElementById(containerId);
        this.sourceCanvases = liveContainer ? Array.from(liveContainer.getElementsByTagName("canvas")) : [];
    }

    /**
     * @public
     * @description Constructs the hidden WebGL composite canvas and begins the requestAnimationFrame capture loop.
     * @param {string} containerId - Target DOM container wrapping the Cytoscape canvases.
     * @param {number} targetW - Canvas output width.
     * @param {number} targetH - Canvas output height.
     * @param {number} fps - Target frames per second for the compositor loop.
     * @param {string} subtitleTitle - Optional burned-in title.
     * @param {string} subtitleDesc - Optional burned-in description.
     * @returns {MediaStream | null} The active media stream for recording.
     */
    public start(containerId: string, targetW: number, targetH: number, fps: number, subtitleTitle: string, subtitleDesc: string): MediaStream | null {
        this.compositeCanvas = document.createElement("canvas");
        this.compositeCanvas.width = targetW;
        this.compositeCanvas.height = targetH;
        const ctx = this.compositeCanvas.getContext("2d");
        if (!ctx) return null;

        // UX ARCHITECTURE: Auto-detect Fiori Dark/Light Theme for the background
        const isDarkTheme = document.body.classList.contains("sapTheme-sap_horizon_dark");
        const bgColor = isDarkTheme ? "#12171c" : "#f2f4f6";

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, targetW, targetH);

        // ARCHITECTURE FIX: Fiori FlexibleColumnLayout relies on strict viewport boundaries.
        // We keep it at top: 0 to prevent WebKit "Occlusion Culling".
        // We strictly use opacity: 0.01 WITHOUT clip-path to prevent Chromium from aggressively culling the rasterization.
        this.compositeCanvas.style.position = "fixed";
        this.compositeCanvas.style.top = "0px";
        this.compositeCanvas.style.left = "0px";
        this.compositeCanvas.style.pointerEvents = "none";
        this.compositeCanvas.style.opacity = "0.01";
        this.compositeCanvas.style.zIndex = "-9999";
        document.body.appendChild(this.compositeCanvas);

        this.isActive = true;
        this.updateTarget(containerId);

        let lastDrawTime = 0;
        const frameInterval = 1000 / fps; // Target dynamic FPS for compositor

        const drawFrame = (timestamp: DOMHighResTimeStamp = 0) => {
            if (!this.compositeCanvas || !this.isActive) return;
            
            this.rafId = requestAnimationFrame(drawFrame);

            // CPU PERFORMANCE FIX: Halt DOM queries and WebGL copying while paused or loading
            if (!this.isPaused) {
                const elapsed = timestamp - lastDrawTime;
                if (elapsed < frameInterval) return;
                
                // HIGH PRECISION THROTTLE: Account for timing drift to prevent micro-stutters
                lastDrawTime = timestamp - (elapsed % frameInterval);

                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, targetW, targetH);
                
                for (let i = 0; i < this.sourceCanvases.length; i++) {
                    const srcCvs = this.sourceCanvases[i];
                    if (!srcCvs.isConnected) continue;

                    const srcW = srcCvs.width;
                    const srcH = srcCvs.height;
                    if (srcW === 0 || srcH === 0) continue;
                    
                    const drawScale = Math.min(targetW / srcW, targetH / srcH);
                    const drawW = srcW * drawScale;
                    const drawH = srcH * drawScale;
                    const drawX = (targetW - drawW) / 2;
                    const drawY = (targetH - drawH) / 2;
                    
                    try {
                        ctx.drawImage(srcCvs, drawX, drawY, drawW, drawH);
                    } catch (e) {
                        // Suppress InvalidStateError if Cytoscape destroyed the WebGL context mid-frame
                    }
                }
                SubtitleEngine.burn(ctx, targetW, targetH, subtitleTitle, subtitleDesc);
            }
        };
        drawFrame(); 

        return (this.compositeCanvas as IStreamCanvas).captureStream(fps);
    }

    /**
     * @public
     * @description Halts the WebGL rendering loop to conserve CPU.
     */
    public pause(): void { this.isPaused = true; }
    
    /**
     * @public
     * @description Resumes the WebGL rendering loop.
     */
    public resume(): void { this.isPaused = false; }

    /**
     * @public
     * @description Completely destroys the composite canvas and halts the frame loop.
     */
    public destroy(): void {
        this.isActive = false;
        if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        if (this.compositeCanvas) {
            // ENTERPRISE FIX: Instantly purge the massive GPU video buffer before GC sweeps
            this.compositeCanvas.width = 0;
            this.compositeCanvas.height = 0;
            if (this.compositeCanvas.parentNode) { this.compositeCanvas.parentNode.removeChild(this.compositeCanvas); }
        }
        this.compositeCanvas = null;
        this.sourceCanvases = [];
    }
}
