import Fragment from "sap/ui/core/Fragment";
import View from "sap/ui/core/mvc/View";
import SelectDialog from "sap/m/SelectDialog";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Event from "sap/ui/base/Event";
import MessageToast from "sap/m/MessageToast";
import ListBinding from "sap/ui/model/ListBinding";

export default class CdsValueHelpHandler {
    private _oParentView: View;
    private _oDialog: SelectDialog | null = null;
    private _fnOnSelectCallback: (sSelectedCds: string) => void;
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
        this._applyEmptyState();
        this._oDialog.open(""); // Satisfies Expected 1 Argument
    }

    public onSearch(oEvent: Event): void {
        const sValue = ((oEvent as any).getParameter("value") as string || "").trim();
        const oSelectDialog = oEvent.getSource() as SelectDialog;
        const oBinding = oSelectDialog.getBinding("items") as ListBinding;
        
        if (!oBinding) return;

        if (sValue.includes("*") || sValue.includes("%")) {
            MessageToast.show("Wildcards are automatic. Use standard characters.");
            this._applyEmptyState();
            return;
        }

        if (sValue.length < this.MIN_SEARCH_LEN) {
            this._applyEmptyState();
            return;
        }

        this._oDialog?.setNoDataText("No results.");
        oBinding.filter([new Filter("CdsName", FilterOperator.Contains, sValue)]);
    }

    public onConfirm(oEvent: Event): void {
        const oSelectedItem = (oEvent as any).getParameter("selectedItem");
        if (oSelectedItem) this._fnOnSelectCallback(oSelectedItem.getTitle());
        this._applyEmptyState();
    }

    private _applyEmptyState(): void {
        if (this._oDialog) {
            this._oDialog.setNoDataText(`Enter ${this.MIN_SEARCH_LEN} characters...`);
            const oBinding = this._oDialog.getBinding("items") as ListBinding;
            if (oBinding) oBinding.filter([new Filter("CdsName", FilterOperator.EQ, "___EMPTY___")]);
        }
    }
}