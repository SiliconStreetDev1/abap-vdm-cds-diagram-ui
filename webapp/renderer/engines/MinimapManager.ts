/**
 * @class MinimapManager
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @description Handles the raw DOM manipulation, dragging, and resizing mathematics for the Fiori minimap overlay.
 */
import type { Core } from "cytoscape";
import { EventManager } from "../../events/EventManager";

export default class MinimapManager {
    
    // Track left/bottom instead of transform to prevent coordinate math breaking in the canvas
    private static minimapState = { w: 200, h: 200, left: 20, bottom: 20 };
    private static navInstances: Map<string, any> = new Map();
    private static showMinimaps: Map<string, boolean> = new Map();
    private static minimapCleanups: Map<string, (() => void)> = new Map();

    /**
     * @public
     * @static
     * @description Retrieves the stored visibility state of the minimap.
     */
    public static getShowState(viewId: string): boolean {
        return this.showMinimaps.get(viewId) || false;
    }

    /**
     * @public
     * @static
     * @description Instantiates, toggles, or destroys the cytoscape-navigator plugin based on user UI commands.
     */
    public static toggle(viewId: string, cyInstance: Core | undefined, show: boolean): void {
        this.showMinimaps.set(viewId, show);
        if (!cyInstance) return;
        
        let navInstance = this.navInstances.get(viewId);
        if (show) {
            if (!navInstance && typeof (cyInstance as any).navigator === "function") {
                navInstance = (cyInstance as any).navigator({ container: false });
                this.navInstances.set(viewId, navInstance);
                const navElem = navInstance.$panel;
                if (navElem) {
                    this.minimapCleanups.set(viewId, this.enhancePanel(viewId, navElem, cyInstance));
                }
                cyInstance.one("render", () => cyInstance.resize());
            }
        } else if (navInstance) {
            this.destroy(viewId);
        }
        if (show) cyInstance.emit('render');
    }

    /**
     * @public
     * @static
     * @description Safely destroys the minimap plugin instance and cleans up its DOM hooks.
     */
    public static destroy(viewId: string): void {
        const navInstance = this.navInstances.get(viewId);
        if (navInstance) {
            navInstance.destroy(); // Let the plugin perform its native teardown first
            
            const fnCleanup = this.minimapCleanups.get(viewId);
            if (fnCleanup) {
                fnCleanup();
                this.minimapCleanups.delete(viewId);
            }
            this.navInstances.delete(viewId);
        }
    }

    /**
     * @public
     * @static
     * @description Injects interactive drag, resize, and close handles into the Cytoscape minimap panel.
     * @param {HTMLElement} navElem - The DOM element of the navigator panel.
     * @param {Core} cy - The active Cytoscape.js instance.
     * @returns {() => void} A teardown closure to safely destroy the event listeners.
     */
    public static enhancePanel(viewId: string, navElem: unknown, cy: Core): () => void {
        this.ensureDefaultStyles();

        // cytoscape-navigator often returns a jQuery object. Extract the raw HTMLElement.
        const domElem: HTMLElement = navElem instanceof HTMLElement ? navElem : ((navElem as { 0?: HTMLElement })[0] || navElem as HTMLElement);

        // ENTERPRISE UX: Dynamically reparent the minimap to the Fullscreen element or Body.
        // This guarantees it can be dragged anywhere on the screen without being clipped by the canvas,
        // and guarantees it remains perfectly visible when entering or exiting Fullscreen mode.
        const reparentMinimap = () => {
            const targetContainer = document.fullscreenElement || (document as any).webkitFullscreenElement || document.body;
            if (domElem.parentNode !== targetContainer) {
                targetContainer.appendChild(domElem);
            }
        };
        reparentMinimap();
        
        document.addEventListener("fullscreenchange", reparentMinimap);
        document.addEventListener("webkitfullscreenchange", reparentMinimap);

        const container = cy.container();
        if (container) container.style.position = "";

        domElem.style.setProperty("width", `${this.minimapState.w}px`, "important");
        domElem.style.setProperty("height", `${this.minimapState.h}px`, "important");
        domElem.style.setProperty("left", `${this.minimapState.left}px`, "important");
        domElem.style.setProperty("bottom", `${this.minimapState.bottom}px`, "important");
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

        const dragHandle = this.createHandle("✥", "Drag Minimap", { top: "8px", left: "50%", transform: "translateX(-50%)", cursor: "grab", color: "#0854a0" });
        const closeHandle = this.createHandle("✖", "Close Minimap", { top: "8px", left: "8px", cursor: "pointer", color: "#e33e38" });
        const trResizeHandle = this.createHandle("⤢", "Resize Minimap", { top: "8px", right: "8px", cursor: "nesw-resize", color: "#0854a0" });

        domElem.appendChild(dragHandle);
        domElem.appendChild(closeHandle);
        domElem.appendChild(trResizeHandle);
        domElem.style.overflow = "hidden";

        // Hook into the central Event Bus / DOM Event system to actually close it
        closeHandle.addEventListener("click", (e: MouseEvent) => { 
            e.stopPropagation(); 
            EventManager.getInstance().publish("canvas:closeMinimapRequest", { viewId: viewId });
        });

        const dragCleanup = this.attachDragLogic(dragHandle, domElem);
        const resizeObj = this.attachResizeLogic(trResizeHandle, domElem, cy);

        return () => {
            document.removeEventListener("fullscreenchange", reparentMinimap);
            document.removeEventListener("webkitfullscreenchange", reparentMinimap);
            dragCleanup();
            if (resizeObj) {
                if (resizeObj.cleanup) resizeObj.cleanup();
                if (resizeObj.ro) resizeObj.ro.disconnect();
            }
            if (domElem && domElem.parentNode) domElem.parentNode.removeChild(domElem);
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
    private static createHandle(sHtml: string, sTitle: string, oStyles: Record<string, string>): HTMLDivElement {
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
    private static attachDragLogic(dragHandle: HTMLDivElement, domElem: HTMLElement): () => void {
        let bIsDragging = false;
        let iStartX = 0, iStartY = 0;
        let iStartLeft = this.minimapState.left, iStartBottom = this.minimapState.bottom;

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
            this.minimapState.left = iStartLeft;
            this.minimapState.bottom = iStartBottom;
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
     * @param {Core} cy - The active Cytoscape.js instance to notify of dimension changes.
     * @returns {any} Cleanup object containing the ResizeObserver and DOM unbinders.
     */
    private static attachResizeLogic(resizeHandle: HTMLDivElement, domElem: HTMLElement, cy: Core): any {
        let bIsResizing = false;
        let iStartX = 0, iStartY = 0, iStartW = 0, iStartH = 0;

        const onResizeMove = (ev: MouseEvent) => {
            if (!bIsResizing) return;
            let newW = Math.max(100, iStartW + (ev.clientX - iStartX));
            let newH = Math.max(100, iStartH - (ev.clientY - iStartY));
            domElem.style.setProperty("width", `${newW}px`, "important");
            domElem.style.setProperty("height", `${newH}px`, "important");
            this.minimapState.w = newW;
            this.minimapState.h = newH;
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

        let ro: ResizeObserver | null = null;
        if (typeof window.ResizeObserver !== "undefined") {
            ro = new window.ResizeObserver(() => { if (cy) cy.emit("resize"); });
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
    private static ensureDefaultStyles(): void {
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