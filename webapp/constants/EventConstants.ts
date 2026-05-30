/**
 * @fileoverview Centralized EventBus and DOM Event constants.
 * @description Eliminates "magic strings" to ensure type-safe event routing across the application.
 */

export const EventChannels = {
    DIAGRAM_ENGINE: "DiagramEngine"
};

export const EventIds = {
    RENDER_REQUEST: "RenderRequest",
    LIVE_FORMAT_UPDATE: "LiveFormatUpdate",
    NODE_DRILL_DOWN: "NodeDrillDownRequest"
};

export const DomEvents = {
    CLOSE_MINIMAP: "CdsCloseMinimapRequest",
    LAYOUT_UNLOCKED: "CdsLayoutUnlocked",
    NODE_CLICKED: "CdsNodeClicked",
    NODE_DRILL_DOWN: "CdsNodeDrillDownRequest",
    FORMAT_SLIDER_UPDATE: "CdsFormatSliderUpdate"
};