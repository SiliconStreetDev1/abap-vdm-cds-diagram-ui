/**
 * @fileoverview Core Data Service for Variant and History Persistence.
 * @description Pure data access layer. Executes OData V4 queries and LocalStorage operations.
 * Completely decoupled from UI5 DOM, Dialogs, or JSONModels.
 */
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { IVariantState } from "../types/IVariantState";

export default class VariantService {

    /**
     * @public
     * @static
     * @description Retrieves all saved user variants from the OData V4 Backend.
     * Maps the stringified JSON CLOB back into strongly typed IVariantState objects.
     * @param {ODataModel} odataModel - The active SAPUI5 OData V4 model instance.
     * @returns {Promise<IVariantState[]>} Promise resolving to the array of strictly typed variant configurations.
     */
    public static async loadVariants(odataModel: ODataModel): Promise<IVariantState[]> {
        if (!odataModel) return [];
        
        const listBinding = odataModel.bindList("/Variant");
        const contexts = await listBinding.requestContexts(0, 500); 
        const variants = contexts.map(context => {
            const data = context.getObject();
            let state: any = {};
            try { 
                state = JSON.parse(data.Configuration); 
            } catch (error) { 
                console.error(`VDM Diagrammer: Failed to parse JSON configuration for Variant ${data.VariantId}`, error);
            }
            state.VariantId = data.VariantId;
            state.IsGlobal = data.IsGlobal;
            state.name = data.VariantName;
            state.cdsName = data.CdsName;
            return state as IVariantState;
        });
        listBinding.destroy();
        return variants;
    }

    /**
     * @public
     * @static
     * @description Creates a brand new variant record on the backend via OData V4 POST.
     * Serializes the massive canvas state into a single JSON payload to minimize database footprint.
     * @param {ODataModel} odataModel - The active SAPUI5 OData V4 model instance.
     * @param {IVariantState} state - The fully captured state of the UI and Diagram canvas.
     * @param {boolean} isGlobal - Flag indicating if this variant should be visible to all users.
     * @returns {Promise<void>} Resolves when the creation is successfully committed.
     */
    public static async createVariant(odataModel: ODataModel, state: IVariantState, isGlobal: boolean): Promise<void> {
        if (!odataModel) throw new Error("OData connection not established.");

        const listBinding = odataModel.bindList("/Variant");
        const context = listBinding.create({
            VariantName: state.name,
            CdsName: (state as any).cdsName || "",
            IsGlobal: isGlobal,
            Configuration: JSON.stringify(state)
        });
        await context.created();
        listBinding.destroy();
    }

    /**
     * @public
     * @static
     * @description Safely PATCHes an existing variant layout via a direct server lookup.
     * Executes a strict EQ filter to resolve the precise UUID context before patching properties.
     * @param {ODataModel} odataModel - The active SAPUI5 OData V4 model instance.
     * @param {string} variantId - The backend UUID of the target variant.
     * @param {IVariantState} state - The updated state of the UI and Diagram canvas.
     * @param {boolean} isGlobal - Flag indicating if this variant is shared globally.
     * @returns {Promise<void>} Resolves when the batch update completes.
     */
    public static async updateVariant(odataModel: ODataModel, variantId: string, state: IVariantState, isGlobal: boolean): Promise<void> {
        if (!odataModel) throw new Error("OData connection not established.");

        const listBinding = odataModel.bindList("/Variant", undefined, undefined, [new Filter("VariantId", FilterOperator.EQ, variantId)]);
        const contexts = await listBinding.requestContexts(0, 1);
        if (contexts.length === 0) throw new Error("Variant not found on server.");
        
        const context = contexts[0];
        context.setProperty("VariantName", state.name);
        context.setProperty("CdsName", (state as any).cdsName || "");
        context.setProperty("IsGlobal", isGlobal);
        context.setProperty("Configuration", JSON.stringify(state));
        
        await odataModel.submitBatch(odataModel.getUpdateGroupId());
        listBinding.destroy();
    }

    /**
     * @public
     * @static
     * @description Safely triggers an OData V4 DELETE request for a specific variant entity.
     * @param {ODataModel} odataModel - The active SAPUI5 OData V4 model instance.
     * @param {string} variantId - The backend UUID of the target variant.
     * @returns {Promise<void>} Resolves when the deletion is confirmed by the backend.
     */
    public static async deleteVariant(odataModel: ODataModel, variantId: string): Promise<void> {
        if (!odataModel) throw new Error("OData connection not established.");

        const listBinding = odataModel.bindList("/Variant", undefined, undefined, [new Filter("VariantId", FilterOperator.EQ, variantId)]);
        const contexts = await listBinding.requestContexts(0, 1);
        if (contexts.length === 0) throw new Error("Variant not found on server.");
        
        const context = contexts[0];
        await context.delete();
        listBinding.destroy();
    }
}