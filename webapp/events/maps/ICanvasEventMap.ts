export interface ICanvasEventMap {
    "canvas:closeMinimapRequest": { viewId?: string };
    "canvas:nodeClicked": { viewId?: string; nodeId?: string };
    "canvas:nodeDrillDownRequest": { viewId?: string; viewName?: string };
    "canvas:formatSliderUpdate": { viewId?: string; node_spacing?: number };
    "canvas:nodePositionChanged": { viewId?: string; diagramId?: string; nodeId: string; oldPos: { x: number; y: number }; newPos: { x: number; y: number }; engine: string };
    "canvas:nodesPositionChanged": { viewId?: string; diagramId?: string; nodes: { nodeId: string; oldPos: { x: number; y: number }; newPos: { x: number; y: number } }[]; engine: string };
    "canvas:nodeDragging": { viewId?: string; nodeId: string };
    "canvas:nodePinned": { viewId?: string };
    "canvas:nodeHidden": { viewId?: string; notesJson?: any; hiddenNodeIds?: string[] };
    "canvas:nodeUnhidden": { viewId?: string };
    "canvas:promptAddNoteRequest": { viewId?: string };
    "canvas:promptEditNoteRequest": { viewId?: string; noteId?: string; text?: string; fontFamily?: string };
    "canvas:addNoteRequest": { viewId?: string; text?: string; color?: string; fontFamily?: string };
    "canvas:editNoteRequest": { viewId?: string; noteId?: string; text?: string; color?: string; fontFamily?: string };
    "canvas:changeNoteColorRequest": { viewId?: string; noteId?: string; bgColor?: string; borderColor?: string };
    "canvas:deleteSelectionRequest": { viewId?: string };
    "canvas:nodesVisibilityChanged": { viewId?: string; hasHidden?: boolean; hiddenNodes?: any[] };
    "canvas:focusModeChanged": { viewId?: string; isFocused?: boolean; nodeName?: string; hasNodeSelected?: boolean; tempFocusMode?: boolean };
    "canvas:ready": { viewId?: string };
    "canvas:undoRequest": { viewId?: string };
    "canvas:redoRequest": { viewId?: string };
    "canvas:variantDirty": { viewId?: string };
}
