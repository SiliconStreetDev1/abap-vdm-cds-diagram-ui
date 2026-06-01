/**
 * @class MinimapManager
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @description Handles the raw DOM manipulation, dragging, and resizing mathematics for the Fiori minimap overlay.
 */
import { DomEvents } from "../../constants/EventConstants";

export default class MinimapManager {
    
    // Track left/bottom instead of transform to prevent coordinate math breaking in the canvas
    private static _minimapState = { w: 200, h: 200, left: 20, bottom: 20 };

    /**
     * @public
     * @static
     * @description Injects interactive drag, resize, and close handles into the Cytoscape minimap panel.
     * @param {HTMLElement} navElem - The DOM element of the navigator panel.
     * @param {any} cy - The active Cytoscape.js instance.
     * @returns {() => void} A teardown closure to safely destroy the event listeners.
     */
    public static enhancePanel(sViewId: string, navElem: any, cy: any): () => void {
        this._ensureDefaultStyles();

        // cytoscape-navigator often returns a jQuery object. Extract the raw HTMLElement.
        const domElem: HTMLElement = navElem instanceof HTMLElement ? navElem : (navElem[0] || navElem);

        domElem.style.setProperty("width", `${this._minimapState.w}px`, "important");
        domElem.style.setProperty("height", `${this._minimapState.h}px`, "important");
        domElem.style.setProperty("left", `${this._minimapState.left}px`, "important");
        domElem.style.setProperty("bottom", `${this._minimapState.bottom}px`, "important");
        domElem.style.setProperty("top", "auto", "important");
        domElem.style.setProperty("right", "auto", "important");
        domElem.style.setProperty("max-width", "none", "important");
        domElem.style.setProperty("max-height", "none", "important");
        
        // Fix transparency and make it look like a solid Fiori panel
        domElem.style.setProperty("position", "absolute", "important");
        domElem.style.setProperty("background-color", "#ffffff", "important");
        domElem.style.setProperty("border", "1px solid #d9d9d9", "important");
        domElem.style.setProperty("box-shadow", "0 4px 12px rgba(0,0,0,0.15)", "important");
        domElem.style.setProperty("border-radius", "4px", "important");
        domElem.style.setProperty("z-index", "9999", "important");

        const dragHandle = this._createHandle("✥", "Drag Minimap", { top: "8px", left: "50%", transform: "translateX(-50%)", cursor: "grab", color: "#0854a0" });
        const closeHandle = this._createHandle("✖", "Close Minimap", { top: "8px", left: "8px", cursor: "pointer", color: "#e33e38" });
        const trResizeHandle = this._createHandle("⤢", "Resize Minimap", { top: "8px", right: "8px", cursor: "nesw-resize", color: "#0854a0" });

        domElem.appendChild(dragHandle);
        domElem.appendChild(closeHandle);
        domElem.appendChild(trResizeHandle);
        domElem.style.overflow = "hidden";

        // Hook into the central Event Bus / DOM Event system to actually close it
        closeHandle.addEventListener("click", (e: MouseEvent) => { 
            e.stopPropagation(); 
            document.dispatchEvent(new CustomEvent(DomEvents.CLOSE_MINIMAP, { detail: { viewId: sViewId } }));
        });

        const dragCleanup = this._attachDragLogic(dragHandle, domElem);
        const resizeObj = this._attachResizeLogic(trResizeHandle, domElem, cy);

        return () => {
            dragCleanup();
            if (resizeObj) {
                if (resizeObj.cleanup) resizeObj.cleanup();
                if (resizeObj.ro) resizeObj.ro.disconnect();
            }
        };
    }

    /**
     * @private
     * @static
     * @description Constructs a styled, absolutely positioned DOM handle for panel interaction.
     * @param {string} sHtml - Inner HTML or icon character.
     * @param {string} sTitle - Tooltip text.
     * @param {Record<string, string>} oStyles - Map of CSS properties.
     * @returns {HTMLDivElement} The generated handle DOM element.
     */
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

    /**
     * @private
     * @static
     * @description Binds standard mousedown/mousemove logic to allow the panel to be dragged across the viewport.
     * @param {HTMLDivElement} dragHandle - The DOM element serving as the drag zone.
     * @param {HTMLElement} navElem - The minimap panel DOM element.
     * @returns {() => void} Cleanup function to detach the drag listeners.
     */
    private static _attachDragLogic(dragHandle: HTMLDivElement, domElem: HTMLElement): () => void {
        let bIsDragging = false;
        let iStartX = 0, iStartY = 0;
        let iStartLeft = this._minimapState.left, iStartBottom = this._minimapState.bottom;

        const onDragMove = (e: MouseEvent) => {
            if (!bIsDragging) return;
            // Use left/bottom directly. Y-axis is inverted for bottom.
            const newLeft = iStartLeft + (e.clientX - iStartX);
            const newBottom = iStartBottom - (e.clientY - iStartY);
            domElem.style.setProperty("left", `${newLeft}px`, "important");
            domElem.style.setProperty("bottom", `${newBottom}px`, "important");
        };

        const onDragUp = (e: MouseEvent) => {
            if (!bIsDragging) return;
            bIsDragging = false;
            document.body.style.removeProperty("cursor");
            if (!dragHandle.matches(':hover')) dragHandle.style.opacity = "0.4";
            iStartLeft += e.clientX - iStartX;
            iStartBottom -= e.clientY - iStartY;
            this._minimapState.left = iStartLeft;
            this._minimapState.bottom = iStartBottom;
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
        
        return () => {
            document.removeEventListener("mousemove", onDragMove);
            document.removeEventListener("mouseup", onDragUp);
        };
    }

    /**
     * @private
     * @static
     * @description Binds resize logic to the minimap panel, enforcing minimum dimensions and triggering engine updates.
     * @param {HTMLDivElement} resizeHandle - The DOM element serving as the resize grabber.
     * @param {HTMLElement} navElem - The minimap panel DOM element.
     * @param {any} cy - The active Cytoscape.js instance to notify of dimension changes.
     * @returns {any} Cleanup object containing the ResizeObserver and DOM unbinders.
     */
    private static _attachResizeLogic(resizeHandle: HTMLDivElement, domElem: HTMLElement, cy: any): any {
        let bIsResizing = false;
        let iStartX = 0, iStartY = 0, iStartW = 0, iStartH = 0;

        const onResizeMove = (ev: MouseEvent) => {
            if (!bIsResizing) return;
            let newW = Math.max(100, iStartW + (ev.clientX - iStartX));
            let newH = Math.max(100, iStartH - (ev.clientY - iStartY));
            domElem.style.setProperty("width", `${newW}px`, "important");
            domElem.style.setProperty("height", `${newH}px`, "important");
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
            iStartW = domElem.offsetWidth; iStartH = domElem.offsetHeight;
            document.body.style.setProperty("cursor", "nesw-resize", "important");
            e.preventDefault(); e.stopPropagation();
            document.addEventListener("mousemove", onResizeMove);
            document.addEventListener("mouseup", onResizeUp);
        });
        resizeHandle.addEventListener("mouseleave", () => { if (!bIsResizing) resizeHandle.style.opacity = "0.4"; });

        let ro = null;
        if (typeof (window as any).ResizeObserver !== "undefined") {
            ro = new (window as any).ResizeObserver(() => { if (cy) cy.emit("resize"); });
            ro.observe(domElem);
        }
        return {
            ro: ro,
            cleanup: () => {
                document.removeEventListener("mousemove", onResizeMove);
                document.removeEventListener("mouseup", onResizeUp);
            }
        };
    }

    /**
     * @private
     * @static
     * @description Injects required core CSS for cytoscape-navigator if the external stylesheet wasn't bundled.
     */
    private static _ensureDefaultStyles(): void {
        if (!document.getElementById("vdm-minimap-styles")) {
            const style = document.createElement("style");
            style.id = "vdm-minimap-styles";
            style.innerHTML = `
                .cytoscape-navigator { position: absolute !important; }
                .cytoscape-navigator canvas { position: absolute !important; top: 0 !important; left: 0 !important; z-index: 1 !important; width: 100% !important; height: 100% !important; pointer-events: none !important; }
                .cytoscape-navigator .cytoscape-navigatorView { position: absolute !important; border: 2px solid #0854a0 !important; background: rgba(8, 84, 160, 0.15) !important; z-index: 2 !important; border-radius: 2px !important; pointer-events: none !important; }
                .cytoscape-navigator .cytoscape-navigatorOverlay { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; z-index: 3 !important; cursor: crosshair !important; }
            `;
            document.head.appendChild(style);
        }
    }
}