/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.handlers
 * @fileoverview Manages UI States and Exports for native Video Recording.
 * @description Bridges the gap between the Fiori UI5 View Model and the native HTML5 VideoRecorder.
 */
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import HTML from "sap/ui/core/HTML";
import VideoRecorder from "../video/VideoRecorder";

export default class VideoRecordHandler {
    private _oView: View;
    private _oRecorder: VideoRecorder;
    private _fnGetText: (k: string) => string;

    /**
     * @constructor
     * @param {View} oView - Reference to the active UI5 view.
     * @param {Function} fnGetText - Delegate function for i18n translations.
     */
    constructor(oView: View, fnGetText: (k: string) => string) {
        this._oView = oView;
        this._fnGetText = fnGetText;
        this._oRecorder = new VideoRecorder();
    }

    /**
     * @public
     * @description Initiates the video recording pipeline and sets the UI state.
     * @param {string} sMode - "CANVAS" (Diagram Only) or "SCREEN" (Full UI).
     * @returns {void}
     */
    public startRecording(sMode: string): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        
        if (oViewModel) {
            oViewModel.setProperty("/isRecording", true);
            oViewModel.setProperty("/recordingTime", "00:00");
            oViewModel.setProperty("/isVideoPaused", false);
            oViewModel.setProperty("/recordingMode", sMode);
        }
        const sResolution = oViewModel ? oViewModel.getProperty("/videoResolution") : "SCREEN";

        if (sMode === "CANVAS") {
            // Retrieve the explicit DOM wrapper ID created by DomManager.setupCanvas()
            const oHtml = this._oView.byId("htmlRenderer") as HTML;
            const sWrapperId = oHtml.getId() + "-vdmCanvasContainer";

            this._oRecorder.startCanvasRecording(
                sWrapperId,
                sResolution,
                (blob) => this._onStop(blob),
                (err) => this._onError(err),
                (elapsed) => this._onTick(elapsed)
            );
        } else {
            this._oRecorder.startScreenRecording(
                sResolution,
                (blob) => this._onStop(blob),
                (err) => this._onError(err),
                (elapsed) => this._onTick(elapsed)
            );
        }
    }

    /**
     * @public
     * @description Instructs the underlying media recorder to safely terminate and compile the video.
     * @returns {void}
     */
    public stopRecording(): void {
        this._oRecorder.stopRecording();
    }

    /**
     * @public
     * @description Pauses the active recording and updates the Fiori view state.
     * @returns {void}
     */
    public pauseRecording(): void {
        this._oRecorder.pauseRecording();
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty("/isVideoPaused", true);
    }

    /**
     * @public
     * @description Resumes a paused recording and updates the Fiori view state.
     * @returns {void}
     */
    public resumeRecording(): void {
        this._oRecorder.resumeRecording();
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) oViewModel.setProperty("/isVideoPaused", false);
    }

    /**
     * @private
     * @description Callback executed when the MediaRecorder finishes compiling the video Blob.
     * Triggers the native browser download and resets UI states.
     * @param {Blob} oBlob - The compiled video file data.
     * @returns {void}
     */
    private _onStop(oBlob: Blob): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/isRecording", false);
            oViewModel.setProperty("/recordingTime", "00:00");
            oViewModel.setProperty("/isVideoPaused", false);
        }

        const url = URL.createObjectURL(oBlob);
        const link = document.createElement("a");
        link.href = url;
        
        // ENTERPRISE FIX: Dynamically assign extension based on the actual Blob MIME type 
        // to prevent corrupting Apple Safari fallbacks (mp4).
        const sType = oBlob.type || "";
        const sExtension = sType.includes("mp4") ? "mp4" : "webm";
        
        link.download = `VDM_Architecture_${Date.now()}.${sExtension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        MessageToast.show(this._fnGetText("msgRecordingSaved"));
    }

    /**
     * @private
     * @description Callback executed when the MediaRecorder encounters a fatal error or is denied permission.
     * @param {string} sError - The textual error message.
     * @returns {void}
     */
    private _onError(sError: string): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            oViewModel.setProperty("/isRecording", false);
            oViewModel.setProperty("/recordingTime", "00:00");
            oViewModel.setProperty("/isVideoPaused", false);
        }
        MessageToast.show(this._fnGetText("msgRecordingFailed") + ": " + sError);
    }

    /**
     * @private
     * @description Callback executed every second to update the UI5 progress timer.
     * @param {number} iElapsedMs - The total elapsed recording time in milliseconds.
     * @returns {void}
     */
    private _onTick(iElapsedMs: number): void {
        const oViewModel = this._oView.getModel("view") as JSONModel;
        if (oViewModel) {
            const iTotalSeconds = Math.floor(iElapsedMs / 1000);
            const iMins = Math.floor(iTotalSeconds / 60);
            const iSecs = iTotalSeconds % 60;
            oViewModel.setProperty("/recordingTime", `${iMins.toString().padStart(2, '0')}:${iSecs.toString().padStart(2, '0')}`);
        }
    }
}