/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.video
 * @fileoverview Manages cinematic DOM overlays for recording countdowns.
 * @description Safely injects and removes native DOM layers to provide user feedback
 * without relying on heavy SAPUI5 Dialog instantiations.
 */
export default class CountdownOverlay {
    
    /**
     * @public
     * @static
     * @description Injects and animates the cinematic countdown overlay into the Fiori DOM.
     * @param {number} sec - The current countdown second to display.
     * @param {string} viewId - The localized Fiori view ID to scope the overlay to.
     */
    public static show(sec: number, viewId: string): void {
        const overlayId = `vdm-video-countdown-${viewId}`;
        let overlay = document.getElementById(overlayId);
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = overlayId;
            Object.assign(overlay.style, {
                position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                fontSize: "15rem", fontWeight: "bold", color: "#ffffff",
                textShadow: "0px 0px 30px rgba(0,0,0,0.8), 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000",
                zIndex: "99999", pointerEvents: "none", fontFamily: "Impact, Charcoal, sans-serif", opacity: "0"
            });
            
            // Scope to the Fiori View to prevent Launchpad bleeding
            const container = document.getElementById(viewId) || document.body;
            container.appendChild(overlay);

            if (!document.getElementById("vdm-countdown-styles")) {
                const style = document.createElement("style");
                style.id = "vdm-countdown-styles";
                style.innerHTML = `
                    @keyframes vdm-countdown-pop {
                        0% { transform: translate(-50%, -50%) scale(1.5); opacity: 1; }
                        80% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
                        100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        overlay.innerText = sec.toString();
        overlay.style.animation = "none";
        void overlay.offsetWidth; // Force browser reflow to reliably restart the animation
        overlay.style.animation = "vdm-countdown-pop 1s ease-out";
    }

    /**
     * @public
     * @static
     * @description Safely removes the cinematic countdown overlay from the DOM.
     * @param {string} viewId - The localized Fiori view ID.
     */
    public static hide(viewId: string): void {
        const overlay = document.getElementById(`vdm-video-countdown-${viewId}`);
        if (overlay) overlay.remove();
    }
}