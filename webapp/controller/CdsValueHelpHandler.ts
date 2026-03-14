
/**
 * @fileoverview Dedicated Handler Class for the CDS Value Help Dialog.
 * @version 1.2
 * @author Silicon Street Limited
 * * DESIGN RATIONALE:
 * Implements a "Dummy Filter" pattern to prevent massive OData queries 
 * and strictly validates input to block manual wildcards, ensuring backend stability.
 */
import Fragment from "sap/ui/core/Fragment";
import View from "sap/ui/core/mvc/View";
import SelectDialog from "sap/m/SelectDialog";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Event from "sap/ui/base/Event";
import MessageToast from "sap/m/MessageToast"; // Imported for user feedback

export default class CdsValueHelpHandler {
    
    private _oParentView: View;
    private _oDialog: SelectDialog | null = null;
    private _fnOnSelectCallback: (sSelectedCds: string) => void;
    
    // ENTERPRISE UX: Define the minimum characters required to trigger a DB search
    private readonly MIN_SEARCH_LEN = 4;

    constructor(oParentView: View, fnOnSelectCallback: (sSelectedCds: string) => void) {
        this._oParentView = oParentView;
        this._fnOnSelectCallback = fnOnSelectCallback;
    }

    public async open(): Promise<void> {
        if (!this._oDialog) {
            this._oDialog = await Fragment.load({
                id: this._oParentView.getId(),
                name: "nz.co.siliconstreet.vdmdiagrammer.view.fragments.CdsValueHelp", 
                controller: this 
            }) as SelectDialog;

            this._oParentView.addDependent(this._oDialog);
        }

        // Apply the block immediately when the dialog opens
        this._applyEmptyState();
        this._oDialog.open();
    }

    public onSearch(oEvent: Event): void {
        const sValue = (oEvent.getParameter("value") as string).trim();
        const oBinding = (oEvent.getSource() as SelectDialog).getBinding("items");
        
        if (!oBinding) return;

        // ------------------------------------------------------------------
        // NEW VALIDATION: Block manual wildcards to prevent backend conflict
        // ------------------------------------------------------------------
        if (sValue.includes("*") || sValue.includes("%")) {
            // Warn the user politely without crashing the app
            MessageToast.show("Wildcards (* and %) are applied automatically. Please type standard characters only.");
            this._applyEmptyState();
            return;
        }

        // GATEKEEPER CHECK: Is the search string long enough?
        if (sValue.length < this.MIN_SEARCH_LEN) {
            this._applyEmptyState();
            return;
        }

        // If it passes all checks, execute the real search and update the no data text
        this._oDialog?.setNoDataText("No CDS views found matching your search.");
        oBinding.filter([new Filter("CdsName", FilterOperator.Contains, sValue)]);
    }

    public onConfirm(oEvent: Event): void {
        const oSelectedItem = oEvent.getParameter("selectedItem");
        if (oSelectedItem) {
            this._fnOnSelectCallback(oSelectedItem.getTitle());
        }
        this._applyEmptyState();
    }

    public onCancel(): void {
        this._applyEmptyState();
    }

    /**
     * Prevents the OData model from fetching the entire repository by applying 
     * a filter that is guaranteed to return 0 rows instantly.
     */
    private _applyEmptyState(): void {
        if (this._oDialog) {
            // Give the user clear visual feedback on why the list is empty
            this._oDialog.setNoDataText(`Please enter at least ${this.MIN_SEARCH_LEN} characters to search...`);
            
            const oBinding = this._oDialog.getBinding("items");
            if (oBinding) {
                // By searching for a string with spaces and special characters, 
                // we guarantee it will safely hit 0 rows in the backend.
                oBinding.filter([new Filter("CdsName", FilterOperator.EQ, "___REQUIRE_INPUT___")]);
            }
        }
    }
}