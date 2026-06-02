/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.video
 * @fileoverview Burns native 2D subtitles into canvas compositor streams.
 */
export default class SubtitleEngine {
    /**
     * @public
     * @description Draws a lower-third Fiori-styled subtitle box on the target context.
     */
    public static burn(ctx: CanvasRenderingContext2D, targetW: number, targetH: number, title: string, desc: string): void {
        if (!title && !desc) return;

        const iPadding = 40;
        const iBoxHeight = desc ? 120 : 80;
        const iBoxY = targetH - iBoxHeight - iPadding;
        const iBoxWidth = targetW - (iPadding * 2);

        ctx.save();
        
        // Draw semi-transparent dark background for text readability
        ctx.fillStyle = "rgba(25, 30, 35, 0.85)"; // SAP Horizon Dark Contrast
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(iPadding, iBoxY, iBoxWidth, iBoxHeight, 12);
        } else {
            // Enterprise fallback for older browsers that don't support roundRect
            const r = 12;
            ctx.moveTo(iPadding + r, iBoxY);
            ctx.arcTo(iPadding + iBoxWidth, iBoxY, iPadding + iBoxWidth, iBoxY + iBoxHeight, r);
            ctx.arcTo(iPadding + iBoxWidth, iBoxY + iBoxHeight, iPadding, iBoxY + iBoxHeight, r);
            ctx.arcTo(iPadding, iBoxY + iBoxHeight, iPadding, iBoxY, r);
            ctx.arcTo(iPadding, iBoxY, iPadding + iBoxWidth, iBoxY, r);
        }
        ctx.fill();

        // Draw Title
        if (title) {
            ctx.font = "bold 32px '72', Arial, Helvetica, sans-serif"; // SAP Fiori Font
            ctx.fillStyle = "#ffffff";
            ctx.fillText(title, iPadding + 30, iBoxY + 45);
        }

        // Draw Description
        if (desc) {
            ctx.font = "24px '72', Arial, Helvetica, sans-serif";
            ctx.fillStyle = "#dddddd";
            ctx.fillText(desc, iPadding + 30, iBoxY + 90);
        }
        
        ctx.restore();
    }
}