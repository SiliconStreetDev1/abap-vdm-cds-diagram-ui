/**
 * @fileoverview Centralized dictionary for JSON Model property paths.
 * @description Eradicates "magic strings" across handlers and controllers, 
 * providing a strictly typed single source of truth for UI and View state paths.
 */

export const ModelNames = {
    UI: "ui",
    VIEW: "view",
    DIAGRAM_DATA: "diagramData",
    VARIANTS: "variants",
    HISTORY: "history",
    I18N: "i18n"
} as const;

export const UiState = {
    ACTIVE_ENGINE: "/activeEngine",
    IS_CANVAS_STALE: "/isCanvasStale",
    IS_DRILL_DOWN: "/isDrillDown",
    IS_FETCHING: "/isFetching",
    FCL_LAYOUT: "/fclLayout",
    IS_VIEWER_MODE: "/isViewerMode",
    NODES_DRAGGED: "/nodesDragged",
    VARIANT_DIRTY: "/variantDirty",
    LAST_GENERATED_CDS: "/lastGeneratedCdsName",
    IS_GLOBAL: "/isGlobal",
    IS_UNLISTED: "/isUnlisted",
    SELECTED_VARIANT: "/selectedVariant",
    
    // Video Engine Flags
    IS_RECORDING: "/isRecording",
    IS_VIDEO_PAUSED: "/isVideoPaused",
    AUTO_PAUSED: "/_autoPaused",
    RECORDING_MODE: "/recordingMode",
    RECORDING_MODE_INPUT: "/recordingModeInput",
    RECORDING_TIME: "/recordingTime",
    VIDEO_RESOLUTION: "/videoResolution",
    VIDEO_FPS: "/videoFps",
    VIDEO_QUALITY: "/videoQuality",
    VIDEO_DELAY: "/videoDelay",
    VIDEO_MAX_LENGTH: "/videoMaxLength",
    VIDEO_TITLE: "/videoTitle",
    VIDEO_SUBTITLE: "/videoSubtitle",
    IS_COUNTING_DOWN: "/isCountingDown",
    IS_WAITING_FOR_PERMISSION: "/isWaitingForPermission",
    ENABLE_VIDEO_RECORDING: "/enableVideoRecording",
    COUNTDOWN_TIME: "/countdownTime",
    ENABLE_AUDIO: "/enableAudio"
} as const;

export const ViewState = {
    HAS_DIAGRAM: "/hasDiagram",
    HAS_ERROR: "/hasError",
    ERROR_TEXT: "/errorText",
    SHOW_MINIMAP: "/showMinimap",
    CAN_SHOW_MINIMAP: "/canShowMinimap",
    CAN_SEARCH: "/canSearch",
    CAN_EXPORT_IMG: "/canExportImg",
    CAN_EXPORT_SOURCE: "/canExportSource",
    HAS_HIDDEN_NODES: "/hasHiddenNodes",
    HIDDEN_NODES_LIST: "/hiddenNodesList",
    IS_SELECT_MODE: "/isSelectMode",
    IS_FOCUS_MODE: "/isFocusMode",
    FOCUS_NODE_NAME: "/focusNodeName",
    HAS_NODE_SELECTED: "/hasNodeSelected",
    TEMP_FOCUS_MODE: "/tempFocusMode"
} as const;

export const DiagramData = {
    PAYLOAD: "/payload",
    ENGINE: "/engine",
    CDS_NAME: "/cdsName",
    BREADCRUMB_LINKS: "/breadcrumbLinks",
    CURRENT_BREADCRUMB: "/currentBreadcrumb"
} as const;