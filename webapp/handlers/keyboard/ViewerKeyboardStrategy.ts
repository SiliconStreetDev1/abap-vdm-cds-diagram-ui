/**
 * @fileoverview Read-Only Keyboard Strategy.
 * @description Strictly limits keyboard interactions to non-destructive viewport navigation.
 */
import BaseKeyboardStrategy from "./BaseKeyboardStrategy";

export default class ViewerKeyboardStrategy extends BaseKeyboardStrategy {
    
    public mapShortcuts(e: KeyboardEvent, bIsTyping: boolean): void {
        if (bIsTyping) return;

        const bCtrl = e.ctrlKey || e.metaKey;
        const bShift = e.shiftKey;
        const sKey = e.key ? e.key.toLowerCase() : "";
        const sRawKey = e.key || "";

        if (bCtrl && !bShift && !e.altKey) {
            if (sKey === "a") { e.preventDefault(); this._selectAll(); return; }
        }

        if (bShift && !bCtrl && !e.altKey) {
            if (sKey === "m") { e.preventDefault(); this._toggleMinimap(); return; }
            if (sKey === "h") { e.preventDefault(); this._toggleHidden(); return; }
        }

        if (!bCtrl && !bShift && !e.altKey) {
            if (sKey === "s" || sKey === "v") { e.preventDefault(); this.setMode("select"); return; }
            if (sKey === "p" || sKey === "h") { e.preventDefault(); this.setMode("pan"); return; }
            if (sRawKey === "Escape") { this._clearSelection(); return; }
            if (sRawKey === "Delete" || sRawKey === "Backspace") { e.preventDefault(); this._deleteSelection(); return; }
        }
    }
}