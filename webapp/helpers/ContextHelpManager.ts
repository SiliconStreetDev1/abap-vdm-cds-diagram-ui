/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.helpers
 * @fileoverview Centralized Context Help Manager.
 * @description Orchestrates the creation and display of contextual information popovers across all views.
 */
import Event from "sap/ui/base/Event";
import View from "sap/ui/core/mvc/View";
import Icon from "sap/ui/core/Icon";
import ResponsivePopover from "sap/m/ResponsivePopover";
import FormattedText from "sap/m/FormattedText";
import JSONModel from "sap/ui/model/json/JSONModel";

export default class ContextHelpManager {
    private static _mPopovers: Map<string, ResponsivePopover> = new Map();

    /**
     * @public
     * @static
     * @description Retrieves the targeted i18n text and displays it in a singleton ResponsivePopover next to the triggering icon.
     * @param {Event} oEvent - The icon press event.
     * @param {View} oView - The current SAPUI5 View to which the popover will be attached.
     * @param {(k: string, args?: any[]) => string} fnGetText - The bound i18n getter function.
     * @returns {void}
     */
    public static openPopover(oEvent: Event, oView: View, fnGetText: (k: string, args?: any[]) => string): void {
        const oIcon = oEvent.getSource() as Icon;
        const sInfoType = oIcon.data("infoType") as string;
        const sViewId = oView.getId();
        
        let oPopover = this._mPopovers.get(sViewId);

        // ENTERPRISE FIX: Key popovers per-view to prevent UI5 Aggregation Collisions.
        if (!oPopover || oPopover.isDestroyed()) {
            oPopover = new ResponsivePopover({
                placement: "Auto",
                contentWidth: "350px", // Expanded to support clean bullet lists
                showHeader: true,
                content: [ new FormattedText({ htmlText: "{popover>/text}" }).addStyleClass("sapUiSmallMargin") ]
            });
            this._mPopovers.set(sViewId, oPopover);
            oView.addDependent(oPopover); // Ensures proper i18n and theme inheritance
        }

        oPopover.setModel(new JSONModel({ text: fnGetText(`infoText${sInfoType}`) }), "popover");
        oPopover.setTitle(fnGetText(`infoTitle${sInfoType}`));
        oPopover.openBy(oIcon);
    }

    /**
     * @public
     * @static
     * @description Destroys the popover and severs the memory reference to prevent GC leaks on View exit.
     * @param {string} sViewId - The current SAPUI5 View ID.
     */
    public static destroy(sViewId: string): void {
        const oPopover = this._mPopovers.get(sViewId);
        if (oPopover) {
            if (!oPopover.isDestroyed()) oPopover.destroy();
            this._mPopovers.delete(sViewId);
        }
    }
}