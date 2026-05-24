/**
 * @class MinimapManager
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @description Handles the raw DOM manipulation, dragging, and resizing mathematics for the Fiori minimap overlay.
 */
export default class MinimapManager {
    
    private static _minimapState = { w: 200, h: 200, x: 0, y: 0 };

    public static enhancePanel(navElem: HTMLElement, cy: any, currentInstance: unknown): void {
        // Apply persisted session state immediately to prevent layout jumping
        navElem.style.setProperty("width", `${this._minimapState.w}px`, "important");
        navElem.style.setProperty("height", `${this._minimapState.h}px`, "important");
        navElem.style.transform = `translate(${this._minimapState.x}px, ${this._minimapState.y}px)`;
        navElem.style.setProperty("max-width", "none", "important");
        navElem.style.setProperty("max-height", "none", "important");

        const dragHandle = this._createHandle("✥", "Drag Minimap", { top: "8px", left: "50%", transform: "translateX(-50%)", cursor: "grab", color: "#0854a0" });
        const closeHandle = this._createHandle("✖", "Close Minimap", { top: "8px", left: "8px", cursor: "pointer", color: "#e33e38" });
        const trResizeHandle = this._createHandle("⤢", "Resize Minimap", { top: "8px", right: "8px", cursor: "nesw-resize", color: "#0854a0" });

        navElem.appendChild(dragHandle);
        navElem.appendChild(closeHandle);
        navElem.appendChild(trResizeHandle);
        navElem.style.overflow = "hidden";

        closeHandle.addEventListener("click", (e: MouseEvent) => { e.stopPropagation(); if (cy) cy.emit("closeMinimap"); });

        this._attachDragLogic(dragHandle, navElem);
        const ro = this._attachResizeLogic(trResizeHandle, navElem, cy);

        // Defensively clean up global listeners if minimap is toggled off mid-drag
        const inst = currentInstance as { destroy: Function };
        const origDestroy = inst.destroy;
        inst.destroy = function() {
            if (ro) ro.disconnect();
            origDestroy.apply(this, arguments);
        };
    }

    private static _createHandle(sHtml: string, sTitle: string, oStyles: Record<string, string>): HTMLDivElement {
        const handle = document.createElement("div");
        handle.innerHTML = sHtml;
        handle.title = sTitle;
        Object.assign(handle.style, {
            position: "absolute", zIndex: "1000", background: "rgba(255, 255, 255, 0.95)",
            border: "1px solid #d9d9d9", borderRadius: "4px", padding: "4px 8px", fontSize: "14px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)", userSelect: "none", opacity: "0.4", transition: "opacity 0.2s ease-in-out", ...oStyles
        });
        handle.addEventListener("mouseenter", () => handle.style.opacity = "1");
        return handle;
    }

    private static _attachDragLogic(dragHandle: HTMLDivElement, navElem: HTMLElement): void {
        let bIsDragging = false;
        let iStartX = 0, iStartY = 0;
        let iCurrentX = this._minimapState.x, iCurrentY = this._minimapState.y;

        const onDragMove = (e: MouseEvent) => {
            if (!bIsDragging) return;
            navElem.style.transform = `translate(${iCurrentX + (e.clientX - iStartX)}px, ${iCurrentY + (e.clientY - iStartY)}px)`;
        };

        const onDragUp = (e: MouseEvent) => {
            if (!bIsDragging) return;
            bIsDragging = false;
            document.body.style.removeProperty("cursor");
            if (!dragHandle.matches(':hover')) dragHandle.style.opacity = "0.4";
            iCurrentX += e.clientX - iStartX;
            iCurrentY += e.clientY - iStartY;
            this._minimapState.x = iCurrentX;
            this._minimapState.y = iCurrentY;
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", onDragUp);
        };

        dragHandle.addEventListener("mousedown", (e: MouseEvent) => {
            bIsDragging = true;
            iStartX = e.clientX; iStartY = e.clientY;
            document.body.style.setProperty("cursor", "grabbing", "important");
            e.preventDefault(); e.stopPropagation();
            document.addEventListener("mousemove", onDragMove);
            document.addEventListener("mouseup", onDragUp);
        });
        dragHandle.addEventListener("mouseleave", () => { if (!bIsDragging) dragHandle.style.opacity = "0.4"; });
    }

    private static _attachResizeLogic(resizeHandle: HTMLDivElement, navElem: HTMLElement, cy: any): any {
        let bIsResizing = false;
        let iStartX = 0, iStartY = 0, iStartW = 0, iStartH = 0;

        const onResizeMove = (ev: MouseEvent) => {
            if (!bIsResizing) return;
            let newW = Math.max(100, iStartW + (ev.clientX - iStartX));
            let newH = Math.max(100, iStartH - (ev.clientY - iStartY));
            navElem.style.setProperty("width", `${newW}px`, "important");
            navElem.style.setProperty("height", `${newH}px`, "important");
            this._minimapState.w = newW;
            this._minimapState.h = newH;
        };

        const onResizeUp = () => {
            if (!bIsResizing) return;
            bIsResizing = false;
            document.body.style.removeProperty("cursor");
            if (!resizeHandle.matches(':hover')) resizeHandle.style.opacity = "0.4";
            document.removeEventListener("mousemove", onResizeMove);
            document.removeEventListener("mouseup", onResizeUp);
            if (cy) { cy.emit("resize"); cy.emit("render"); }
        };

        resizeHandle.addEventListener("mousedown", (e: MouseEvent) => {
            bIsResizing = true;
            iStartX = e.clientX; iStartY = e.clientY;
            iStartW = navElem.offsetWidth; iStartH = navElem.offsetHeight;
            document.body.style.setProperty("cursor", "nesw-resize", "important");
            e.preventDefault(); e.stopPropagation();
            document.addEventListener("mousemove", onResizeMove);
            document.addEventListener("mouseup", onResizeUp);
        });
        resizeHandle.addEventListener("mouseleave", () => { if (!bIsResizing) resizeHandle.style.opacity = "0.4"; });

        if (typeof (window as any).ResizeObserver !== "undefined") {
            const ro = new (window as any).ResizeObserver(() => { if (cy) cy.emit("resize"); });
            ro.observe(navElem);
            return ro;
        }
        return null;
    }
}