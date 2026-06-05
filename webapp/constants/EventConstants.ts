/**
 * @fileoverview Centralized EventBus and DOM Event constants.
 * @description Eliminates "magic strings" to ensure type-safe event routing across the application.
 */

export const EventChannels = {
    DIAGRAM_ENGINE: "DiagramEngine",
    VIDEO_RECORDING: "VideoRecording"
};

export const EventIds = {
    RENDER_REQUEST: "RenderRequest",
    RENDER_FAILED: "RenderFailed",
    LIVE_FORMAT_UPDATE: "LiveFormatUpdate",
    NODE_DRILL_DOWN: "NodeDrillDownRequest",
    VIEWER_LOADING: "ViewerLoading",
    APPLY_VARIANT_STATE: "ApplyVariantState",
    VIDEO_AUTO_PAUSE: "AutoPause",
    VIDEO_AUTO_RESUME: "AutoResume",
    VIDEO_STOP: "Stop",
    VIDEO_PAUSE: "Pause",
    VIDEO_RESUME: "Resume",
    VIDEO_START: "Start",
    VIDEO_TOGGLE_STEALTH: "ToggleStealth"
};

export const DomEvents = {
    CLOSE_MINIMAP: "CdsCloseMinimapRequest",
    NODE_CLICKED: "CdsNodeClicked",
    NODE_DRILL_DOWN: "CdsNodeDrillDownRequest",
    FORMAT_SLIDER_UPDATE: "CdsFormatSliderUpdate",
    NODE_DRAGGED: "CdsNodeDragged",
    NODE_PINNED: "CdsNodePinned",
    NODE_HIDDEN: "CdsNodeHidden",
    NODE_UNHIDDEN: "CdsNodeUnhidden",
    PROMPT_ADD_NOTE_REQUEST: "CdsPromptAddNoteRequest",
    PROMPT_EDIT_NOTE_REQUEST: "CdsPromptEditNoteRequest",
    ADD_NOTE_REQUEST: "CdsAddNoteRequest",
    EDIT_NOTE_REQUEST: "CdsEditNoteRequest",
    CHANGE_NOTE_COLOR_REQUEST: "CdsChangeNoteColorRequest",
    DELETE_SELECTION_REQUEST: "CdsDeleteSelectionRequest",
    NODES_VISIBILITY_CHANGED: "CdsNodesVisibilityChanged",
    FOCUS_MODE_CHANGED: "CdsFocusModeChanged",
    CANVAS_READY: "CdsCanvasReady",
    UNDO_REQUEST: "CdsUndoRequest"
};