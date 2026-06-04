/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Orchestrates Video Recording UI State and Native Browser Media Capture.
 * @description Decouples video state management and EventBus orchestration from the main controllers.
 * Strictly adheres to the Single Responsibility Principle by managing its own lifecycle and UI state mappings.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import EventBus from "sap/ui/core/EventBus";
import ViewStateHelper from "../helpers/ViewStateHelper";
import FileDownloadUtility from "../helpers/FileDownloadUtility";
import VideoRecorder, { IRecordingConfig } from "../video/VideoRecorder";
import { EventChannels, EventIds } from "../constants/EventConstants";
import ScreenRecorder from "../video/ScreenRecorder";
import CanvasRecorder from "../video/CanvasRecorder";

export default class VideoRecordHandler {
    private view: View;
    private eventBus?: EventBus;
    private recorder: VideoRecorder | null = null;
    private textFormatter: (key: string) => string;

    private autoPauseBind: () => void;
    private autoResumeBind: () => void;
    private stopBind: () => void;
    private pauseBind: () => void;
    private resumeBind: () => void;
    private startBind: () => void;
    private toggleStealthBind: () => void;
    private _bIsAttached: boolean = false;
    private _autoPauseTimer: number | null = null;

    /**
     * Initializes the Video Record Handler.
     * @param {View} view - Reference to the active SAPUI5 view.
     * @param {EventBus} eventBus - Application event bus for auto-pause orchestration.
     * @param {Function} textFormatter - Delegate function for i18n translations.
     */
    constructor(view: View, eventBus: EventBus | undefined, textFormatter: (key: string) => string) {
        this.view = view;
        this.eventBus = eventBus;
        this.textFormatter = textFormatter;

        this.autoPauseBind = this.handleAutoPause.bind(this);
        this.autoResumeBind = this.handleAutoResume.bind(this);
        this.stopBind = this.stopRecording.bind(this);
        this.pauseBind = this.pauseRecording.bind(this);
        this.resumeBind = this.resumeRecording.bind(this);
        this.startBind = this.startRecording.bind(this);
        this.toggleStealthBind = this.handleToggleStealth.bind(this);
    }

    /**
     * @public
     * @description Subscribes the handler to global application events.
     */
    public attachEvents(): void {
        if (this._bIsAttached) return;

        if (this.eventBus) {
            this.eventBus.subscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_AUTO_PAUSE, this.autoPauseBind, this);
            this.eventBus.subscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_AUTO_RESUME, this.autoResumeBind, this);
            this.eventBus.subscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_STOP, this.stopBind, this);
            this.eventBus.subscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_PAUSE, this.pauseBind, this);
            this.eventBus.subscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_RESUME, this.resumeBind, this);
            this.eventBus.subscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_START, this.startBind, this);
            this.eventBus.subscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_TOGGLE_STEALTH, this.toggleStealthBind, this);
        }
        
        this._bIsAttached = true;
    }

    /**
     * @public
     * @description Unsubscribes global events to prevent memory leaks during view destruction.
     */
    public detachEvents(): void {
        if (!this._bIsAttached) return;

        if (this.eventBus) {
            this.eventBus.unsubscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_AUTO_PAUSE, this.autoPauseBind, this);
            this.eventBus.unsubscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_AUTO_RESUME, this.autoResumeBind, this);
            this.eventBus.unsubscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_STOP, this.stopBind, this);
            this.eventBus.unsubscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_PAUSE, this.pauseBind, this);
            this.eventBus.unsubscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_RESUME, this.resumeBind, this);
            this.eventBus.unsubscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_START, this.startBind, this);
            this.eventBus.unsubscribe(EventChannels.VIDEO_RECORDING, EventIds.VIDEO_TOGGLE_STEALTH, this.toggleStealthBind, this);
        }
        
        this._bIsAttached = false;
    }

    /**
     * @public
     * @description Initiates the video recording pipeline and sets the UI state.
     * @returns {Promise<void>}
     */
    public async startRecording(): Promise<void> {
        const uiModel = this.view.getModel("ui") as JSONModel;
        if (!uiModel) return;

        // ENTERPRISE FIX: Strict Concurrency Mutex Lock. 
        // Prevents rapid UI clicks from spawning overlapping OS prompts or ghost streams.
        if (uiModel.getProperty("/isRecording") || uiModel.getProperty("/isCountingDown") || uiModel.getProperty("/isWaitingForPermission")) {
            return;
        }

        const mode = uiModel.getProperty("/recordingModeInput") || "SCREEN";
        const resolution = uiModel.getProperty("/videoResolution") || "SCREEN";
        const fps = parseInt(uiModel.getProperty("/videoFps") as string, 10) || 30;
        const videoQuality = uiModel.getProperty("/videoQuality") || "HIGH";
        
        const delaySeconds = uiModel.getProperty("/videoDelay") || 0;
        const maxLengthSeconds = uiModel.getProperty("/videoMaxLength") || 150;
        const videoTitle = uiModel.getProperty("/videoTitle") || "";
        const videoSubtitle = uiModel.getProperty("/videoSubtitle") || "";

        // 1. Polymorphic Factory Instantiation
        if (mode === "CANVAS") {
            const diagramModel = this.view.getModel("diagramData") as JSONModel;
            const sEngine = diagramModel ? diagramModel.getProperty("/engine") : "";
            if (sEngine !== "CYTOSCAPE") {
                this.handleRecordingError("Diagram Only mode is only supported for the interactive Cytoscape engine. Please use Entire Screen mode for SVG diagrams.");
                return;
            }

            const htmlControl = this.view.byId("htmlRenderer");
            const wrapperId = htmlControl ? `${htmlControl.getId()}-vdmCanvasContainer` : "";

            if (!wrapperId) {
                this.handleRecordingError("Diagram must be generated before recording the canvas.");
                return;
            }
            this.recorder = new CanvasRecorder(wrapperId);
        } else {
            this.recorder = new ScreenRecorder();
        }

        this.recorder.setMaxDuration(maxLengthSeconds * 1000);
        this.recorder.setSubtitles(videoTitle, videoSubtitle);

        // Reset base UI state; lifecycle management is now fully delegated to the engines
        this.updateUIState({
            isRecording: false,
            isCountingDown: false,
            isWaitingForPermission: false, 
            recordingTime: "00:00",
            isVideoPaused: false,
            recordingMode: mode
        });

        // 2. Build Unified Execution Payload
        const config: IRecordingConfig = {
            viewId: this.view.getId(),
            resolutionStr: resolution,
            fps: fps,
            videoQuality: videoQuality,
            delaySeconds: delaySeconds,
            onWaitingForPermission: () => this.updateUIState({ isWaitingForPermission: true }),
            onPermissionGranted: () => this.updateUIState({ isWaitingForPermission: false }),
            onCountdown: (sec: number) => this.updateUIState({ isWaitingForPermission: false, isCountingDown: true, countdownTime: sec }),
            onStart: () => this.updateUIState({ isWaitingForPermission: false, isCountingDown: false, isRecording: true }),
            onStop: (blob: Blob) => this.handleRecordingStop(blob),
            onError: (err: string) => this.handleRecordingError(err),
            onTick: (ms: number) => this.handleRecordingTick(ms),
            onWarning: (msg: string) => MessageToast.show(msg, { duration: 5000 })
        };

        // 3. True Polymorphic Execution
        this.recorder.start(config);
    }

    /**
     * @public
     * @description Stops the recording process, aborting countdowns or saving active media.
     */
    public stopRecording(): void {
        if (this._autoPauseTimer !== null) {
            window.clearTimeout(this._autoPauseTimer);
            this._autoPauseTimer = null;
        }

        const uiModel = this.view.getModel("ui") as JSONModel;

        if (this.recorder) this.recorder.stopRecording();
        
        if (uiModel && (uiModel.getProperty("/isCountingDown") || uiModel.getProperty("/isWaitingForPermission"))) {
            this.updateUIState({ 
                isCountingDown: false, 
                isRecording: false, 
                isWaitingForPermission: false, 
                recordingTime: "00:00"
            });
        }
    }

    /**
     * @public
     * @description Pauses the active recording and updates the Fiori view state.
     */
    public pauseRecording(): void {
        if (this.recorder) this.recorder.pauseRecording();
        this.updateUIState({ isVideoPaused: true });
    }

    /**
     * @public
     * @description Resumes a paused recording and updates the Fiori view state.
     */
    public resumeRecording(): void {
        if (this.recorder) this.recorder.resumeRecording();
        this.updateUIState({ isVideoPaused: false });
    }

    /**
     * @private
     * @description Auto-pauses recording during heavy CPU operations (e.g. Layout Physics calculations).
     */
    private handleAutoPause(): void {
        const uiModel = this.view.getModel("ui") as JSONModel;
        if (uiModel && uiModel.getProperty("/isRecording") && !uiModel.getProperty("/isVideoPaused") && !uiModel.getProperty("/_autoPaused")) {
            if (this._autoPauseTimer === null) {
                this._autoPauseTimer = window.setTimeout(() => {
                    if (this.recorder) this.recorder.systemPause();
                    this.updateUIState({ _autoPaused: true });
                    this._autoPauseTimer = null;
                }, 250) as unknown as number;
            }
        }
    }

    /**
     * @private
     * @description Auto-resumes recording once CPU operations yield.
     */
    private handleAutoResume(): void {
        if (this._autoPauseTimer !== null) {
            window.clearTimeout(this._autoPauseTimer);
            this._autoPauseTimer = null;
        }

        const uiModel = this.view.getModel("ui") as JSONModel;
        if (uiModel && uiModel.getProperty("/isRecording") && uiModel.getProperty("/_autoPaused")) {
            this.updateUIState({ _autoPaused: false });
            if (this.recorder) this.recorder.systemResume();
        }
    }

    /**
     * @private
     * @description Dispatches the compiled Blob to the user's OS file system.
     */
    private handleRecordingStop(blob: Blob): void {
        this.updateUIState({ 
            isRecording: false, 
            isCountingDown: false, 
            isWaitingForPermission: false, 
            recordingTime: "00:00", 
            isVideoPaused: false
        });

        // ENTERPRISE FIX: Guard against 0-byte blobs caused by browser occlusion culling
        if (!blob || blob.size === 0) {
            MessageToast.show(`${this.textFormatter("msgRecordingFailed")}: The capture stream yielded no frames.`);
            return;
        }

        const mimeType = blob.type || "";
        const extension = mimeType.includes("mp4") ? "mp4" : "webm";
        
        FileDownloadUtility.downloadBlob(blob, `VDM_Architecture_${Date.now()}.${extension}`);
        
        if (!this.view.isDestroyed()) {
            MessageToast.show(this.textFormatter("msgRecordingSaved"));
        }
    }

    /**
     * @private
     */
    private handleRecordingError(errorMsg: string): void {
        this.updateUIState({ 
            isRecording: false, 
            isCountingDown: false, 
            isWaitingForPermission: false, 
            recordingTime: "00:00", 
            isVideoPaused: false
        });
        MessageToast.show(`${this.textFormatter("msgRecordingFailed")}: ${errorMsg}`);
    }

    /**
     * @private
     */
    private handleRecordingTick(elapsedMs: number): void {
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        this.updateUIState({ recordingTime: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` });
    }

    /**
     * @private
     */
    private handleToggleStealth(): void {
        if (!ViewStateHelper.isViewVisible(this.view)) return;
        const uiModel = this.view.getModel("ui") as JSONModel;
        if (!uiModel || !uiModel.getProperty("/enableVideoRecording")) return;
        
        if (uiModel.getProperty("/isRecording") || uiModel.getProperty("/isCountingDown") || uiModel.getProperty("/isWaitingForPermission")) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    /**
     * @private
     * @description Updates the view model in a type-safe, batched manner.
     */
    private updateUIState(state: Record<string, any>): void {
        // Enterprise Fix: Prevent fatal crashes if asynchronous compilation fires after the UI5 view is destroyed
        if (this.view.isDestroyed()) return;
        
        const uiModel = this.view.getModel("ui") as JSONModel;
        if (!uiModel) return;
        Object.keys(state).forEach(key => uiModel.setProperty(`/${key}`, state[key]));
    }
}
