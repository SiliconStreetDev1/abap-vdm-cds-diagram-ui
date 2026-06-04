import VideoRecorder, { IMediaRecorder, IRecordingConfig } from "./VideoRecorder";
import CanvasCompositor from "./CanvasCompositor";

export default class CanvasRecorder extends VideoRecorder {
    private compositor: CanvasCompositor | null = null;
    private containerId: string;

    constructor(containerId: string) {
        super();
        this.containerId = containerId;
    }

    /**
     * @private
     * @description Computes the optimal target resolution for the Canvas compositor.
     * @param {HTMLElement} container - The DOM container holding the WebGL canvases.
     * @param {string} resolutionSetting - The user's desired resolution string.
     * @returns {{w: number, h: number}} The calculated width and height payload.
     */
    private calculateResolution(container: HTMLElement, resolutionSetting: string): { w: number, h: number } {
        const sourceCanvases = container.getElementsByTagName("canvas");
        const baseW = sourceCanvases.length > 0 ? (sourceCanvases[0].width || container.clientWidth) : container.clientWidth;
        const baseH = sourceCanvases.length > 0 ? (sourceCanvases[0].height || container.clientHeight) : container.clientHeight;
        
        let targetW = Math.max(800, baseW);
        let targetH = Math.max(600, baseH);
        
        switch (resolutionSetting.toUpperCase()) {
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

    /**
     * @public
     * @description Initiates the isolated WebGL Canvas compositing and capture pipeline.
     * @param {IRecordingConfig} config - The unified polymorphic configuration payload.
     */
    protected async performCapture(config: IRecordingConfig): Promise<void> {
        this.lastViewId = config.viewId;

        if (config.onPermissionGranted) config.onPermissionGranted();

        const container = document.getElementById(this.containerId);
        if (!container) {
            throw new Error("Canvas container not found.");
        }

        const sourceCanvases = container.getElementsByTagName("canvas");
        if (sourceCanvases.length === 0) {
            throw new Error("No WebGL canvas found to record.");
        }

        if (config.delaySeconds > 0) {
            const completed = await this.delayLoop(config.delaySeconds, config.viewId, config.onCountdown);
            if (!completed) throw new Error("ABORT");
        }
        
        config.onStart();

        const res = this.calculateResolution(container, config.resolutionStr);
        const targetW = res.w;
        const targetH = res.h;
        const dynamicBitrate = this.calculateDynamicBitrate(targetW, targetH, config.fps, config.videoQuality);

        this.compositor = new CanvasCompositor();
        this.stream = this.compositor.start(this.containerId, targetW, targetH, config.fps, this.subtitleTitle, this.subtitleDesc);

        if (!this.stream) throw new Error("Browser engine does not support Canvas Stream Capture.");

        // Delegate standardized encoding to the base class Template Method
        this.startMediaRecorder(config, dynamicBitrate);
    }

    /**
     * @public
     * @description Safely pauses the WebGL compositor loop during heavy CPU operations (like drill-downs).
     */
    public systemPause(): void {
        super.systemPause();
        if (this.compositor) this.compositor.pause();
    }

    /**
     * @public
     * @description Resumes the WebGL compositor loop after a system-level pause.
     */
    public systemResume(): void {
        super.systemResume();
        if (this.compositor) {
            this.compositor.updateTarget(this.containerId);
            this.compositor.resume();
        }
    }

    /**
     * @public
     * @description Pauses the native MediaRecorder and the internal Canvas compositor.
     */
    public pauseRecording(): void {
        super.pauseRecording();
        if (this.compositor) this.compositor.pause();
    }

    /**
     * @public
     * @description Resumes the native MediaRecorder and the internal Canvas compositor.
     */
    public resumeRecording(): void {
        super.resumeRecording();
        if (this.compositor) this.compositor.resume();
    }

    /**
     * @protected
     * @description Executes standard memory cleanup and explicitly destroys the Canvas compositor context.
     */
    protected cleanupMemory(): void {
        super.cleanupMemory();
        if (this.compositor) {
            this.compositor.destroy();
            this.compositor = null;
        }
    }
}
