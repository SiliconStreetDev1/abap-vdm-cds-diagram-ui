import VideoRecorder, { IRecordingConfig } from "./VideoRecorder";

export default class ScreenRecorder extends VideoRecorder {
    /**
     * @public
     * @description Initiates the native screen sharing and media capture pipeline.
     * @param {IRecordingConfig} config - The unified polymorphic configuration payload.
     */
    protected async performCapture(config: IRecordingConfig): Promise<void> {
        this.lastViewId = config.viewId;

        if (config.onWaitingForPermission) config.onWaitingForPermission();

        let videoConstraints: boolean | MediaTrackConstraints = { frameRate: { ideal: config.fps } };
        if (config.resolutionStr === "1080P") videoConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: config.fps } };
        else if (config.resolutionStr === "720P") videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: config.fps } };

        this.stream = await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints, audio: false });
        
        if (config.onPermissionGranted) config.onPermissionGranted();

        if (!this.isStarting) throw new Error("ABORT");
        
        if (config.delaySeconds > 0) {
            const completed = await this.delayLoop(config.delaySeconds, config.viewId, config.onCountdown);
            if (!completed) throw new Error("ABORT");
        }
        
        config.onStart();

        const sMimeType = this.getOptimalMimeType();
        const aVideoTracks = this.stream.getVideoTracks();
        let screenW = 1920;
        let screenH = 1080;
        if (aVideoTracks && aVideoTracks.length > 0) {
            const settings = aVideoTracks[0].getSettings();
            screenW = settings.width || 1920;
            screenH = settings.height || 1080;
            aVideoTracks[0].onended = () => this.stopRecording();
        }

        const dynamicBitrate = this.calculateDynamicBitrate(screenW, screenH, config.fps, config.videoQuality);
        // Delegate standardized encoding to the base class Template Method
        this.startMediaRecorder(config, dynamicBitrate);
    }
}