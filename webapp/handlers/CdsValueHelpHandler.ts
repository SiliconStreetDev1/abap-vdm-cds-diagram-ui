/**
 * @fileoverview Dedicated Handler for the CDS F4 Search Dialog.
 * @version 1.0
 * @author Silicon Street Limited
 * @license Silicon Street Limited License
 * * DESIGN RATIONALE:
 * Encapsulates the UI5 SelectDialog logic into a reusable, isolated class.
 * Implements performance safeguards (minimum search length, wildcard blocking)
 * and uses a "Dummy Filter" pattern to prevent bulk OData fetches on open.
 */
import Fragment from "sap/ui/core/Fragment";
import View from "sap/ui/core/mvc/View";
import SelectDialog from "sap/m/SelectDialog";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Event from "sap/ui/base/Event";
import MessageToast from "sap/m/MessageToast";
import ListBinding from "sap/ui/model/ListBinding";

export default class CdsValueHelpHandler {
    // Member variables
    private _oParentView: View;
    private _oDialog: SelectDialog | null = null;
    private _fnOnSelectCallback: (sSelectedCds: string) => void;
    
    // Performance guard: require at least 4 chars before hitting the backend
    private readonly MIN_SEARCH_LEN = 4;

    /**
     * @constructor
     * @param {View} oParentView - The calling View, used to attach the dialog dependency.
     * @param {Function} fnOnSelectCallback - The function to execute when a CDS is chosen.
     */
    constructor(oParentView: View, fnOnSelectCallback: (sSelectedCds: string) => void) {
        this._oParentView = oParentView;
        this._fnOnSelectCallback = fnOnSelectCallback;
    }

    /**
     * @method open
     * @description Lazy-loads the XML Fragment, attaches it to the view, and opens the SelectDialog.
     * @returns {Promise<void>}
     * @public
     */
    public async open(): Promise<void> {
        // Only load the fragment from the server if it hasn't been instantiated yet
        if (!this._oDialog) {
            this._oDialog = await Fragment.load({
                id: this._oParentView.getId(),
                name: "nz.co.siliconstreet.vdmdiagrammer.view.fragments.CdsValueHelp", 
                controller: this 
            }) as SelectDialog;
            
            // Add dependent ensures the dialog inherits the view's models (OData/i18n)
            this._oParentView.addDependent(this._oDialog);
        }
        
        // Block data loading immediately upon opening
        this._applyEmptyState();
        this._oDialog.open(""); // Satisfies Expected 1 Argument
    }

    /**
     * @method onSearch
     * @description Handles the live search event inside the dialog. Validates input and updates OData binding.
     * @param {Event} oEvent - The search event triggered by the user.
     * @public
     */
    public onSearch(oEvent: Event): void {
        // Extract search value, using 'any' cast to bypass strict UI5 type definitions
        const sValue = ((oEvent as any).getParameter("value") as string || "").trim();
        const oSelectDialog = oEvent.getSource() as SelectDialog;
        const oBinding = oSelectDialog.getBinding("items") as ListBinding;
        
        if (!oBinding) return;

        // Security/UX Check: Prevent manual wildcards which could cause backend ABAP dumps
        if (sValue.includes("*") || sValue.includes("%")) {
            MessageToast.show("Wildcards are automatic. Use standard characters.");
            this._applyEmptyState();
            return;
        }

        // Performance Check: Enforce minimum string length before hitting OData
        if (sValue.length < this.MIN_SEARCH_LEN) {
            this._applyEmptyState();
            return;
        }

        // Input is valid; execute the backend search
        this._oDialog?.setNoDataText("No results.");
        oBinding.filter([new Filter("CdsName", FilterOperator.Contains, sValue)]);
    }

    /**
     * @method onConfirm
     * @description Triggered when the user selects a row in the dialog.
     * @param {Event} oEvent - The confirm event.
     * @public
     */
    public onConfirm(oEvent: Event): void {
        // Extract the selected item and pass its title (CDS Name) back to the main controller
        const oSelectedItem = (oEvent as any).getParameter("selectedItem");
        if (oSelectedItem) this._fnOnSelectCallback(oSelectedItem.getTitle());
        
        // Reset the dialog state for the next time it is opened
        this._applyEmptyState();
    }

    /**
     * @method _applyEmptyState
     * @description Forces a "dummy filter" on the OData binding to guarantee 0 rows are returned.
     * This prevents the SelectDialog from fetching the entire CDS repository on initial load.
     * @private
     */
    private _applyEmptyState(): void {
        if (this._oDialog) {
            this._oDialog.setNoDataText(`Enter ${this.MIN_SEARCH_LEN} characters...`);
            const oBinding = this._oDialog.getBinding("items") as ListBinding;
            
            // "___EMPTY___" is guaranteed to not exist, forcing a fast 0-result return
            if (oBinding) oBinding.filter([new Filter("CdsName", FilterOperator.EQ, "___EMPTY___")]);
        }
    }
}