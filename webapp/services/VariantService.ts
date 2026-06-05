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
    
    private static readonly ENTITY_SET = "/Variant";
    private static readonly UPDATE_GROUP = "VariantUpdateGroup";

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
        
        let userId = "";
        try {
            if (typeof sap !== "undefined" && sap.ushell && (sap.ushell as any).Container) {
                userId = (sap.ushell as any).Container.getService("UserInfo").getUser().getId();
            }
        } catch (e) { }

        const filters: Filter[] = [];
        if (userId) {
            filters.push(new Filter({ filters: [ new Filter("isUnlisted", FilterOperator.EQ, false), new Filter("CreatedBy", FilterOperator.EQ, userId) ], and: false }));
        } else {
            filters.push(new Filter("isUnlisted", FilterOperator.EQ, false));
        }
        
        const listBinding = odataModel.bindList(this.ENTITY_SET, undefined, undefined, filters);
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
            state.isUnlisted = data.isUnlisted;
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
     * @description Bypasses the Unlisted filter to fetch a direct Deep Link Payload.
     */
    public static async getVariantById(odataModel: ODataModel, variantId: string): Promise<IVariantState> {
        if (!odataModel) throw new Error("OData connection not established.");
        const listBinding = odataModel.bindList(this.ENTITY_SET, undefined, undefined, [new Filter("VariantId", FilterOperator.EQ, variantId)]);
        const contexts = await listBinding.requestContexts(0, 1);
        if (contexts.length === 0) throw new Error("Variant not found or access denied.");
        const data = contexts[0].getObject();
        let state: any = {};
        try { state = JSON.parse(data.Configuration); } catch (e) {}
        state.VariantId = data.VariantId; state.IsGlobal = data.IsGlobal; state.isUnlisted = data.isUnlisted; state.name = data.VariantName; state.cdsName = data.CdsName;
        listBinding.destroy();
        return state as IVariantState;
    }

    /**
     * @public
     * @static
     * @description Creates a brand new variant record on the backend via OData V4 POST.
     * Serializes the massive canvas state into a single JSON payload to minimize database footprint.
     * @param {ODataModel} odataModel - The active SAPUI5 OData V4 model instance.
     * @param {IVariantState} state - The fully captured state of the UI and Diagram canvas.
     * @param {boolean} isGlobal - Flag indicating if this variant should be visible to all users.
     * @param {boolean} [isUnlisted=false] - Flag indicating if this variant is an unlisted link.
     * @returns {Promise<void>} Resolves when the creation is successfully committed.
     */
    public static async createVariant(odataModel: ODataModel, state: IVariantState, isGlobal: boolean, isUnlisted: boolean = false): Promise<void> {
        if (!odataModel) throw new Error("OData connection not established.");

        const listBinding = odataModel.bindList(this.ENTITY_SET);
        let context: any;
        try {
            context = listBinding.create({
                VariantName: state.name,
                CdsName: (state as any).cdsName || "",
                IsGlobal: isGlobal,
                isUnlisted: isUnlisted,
                Configuration: JSON.stringify(state)
            });
            await context.created();
        } catch (error: any) {
            if (context) { try { await context.delete(); } catch(e){} }
            try { odataModel.resetChanges(); } catch (e) {}
            throw new Error(error.message || "Failed to create variant.");
        } finally {
            listBinding.destroy();
        }
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
     * @param {boolean} [isUnlisted=false] - Flag indicating if this variant is an unlisted link.
     * @returns {Promise<void>} Resolves when the batch update completes.
     */
    public static async updateVariant(odataModel: ODataModel, variantId: string, state: IVariantState, isGlobal: boolean, isUnlisted: boolean = false): Promise<void> {
        if (!odataModel) throw new Error("OData connection not established.");

        const listBinding = odataModel.bindList(this.ENTITY_SET, undefined, undefined, [new Filter("VariantId", FilterOperator.EQ, variantId)], { $$updateGroupId: this.UPDATE_GROUP, $select: "*" });
        try {
            const contexts = await listBinding.requestContexts(0, 1);
            if (contexts.length === 0) throw new Error("Variant not found on server.");
            
            const context = contexts[0];
            context.setProperty("VariantName", state.name);
            context.setProperty("CdsName", (state as any).cdsName || "");
            context.setProperty("IsGlobal", isGlobal);
            context.setProperty("isUnlisted", isUnlisted);
            context.setProperty("Configuration", JSON.stringify(state));
            
            await odataModel.submitBatch(this.UPDATE_GROUP);
            
            // ENTERPRISE FIX: submitBatch resolves even if the backend returns HTTP 400/403.
            // We must explicitly check if the changes were rejected and left in the pending queue.
            if (odataModel.hasPendingChanges(this.UPDATE_GROUP)) {
                throw new Error("Backend validation or ETag mismatch rejected the update.");
            }
        } catch (error: any) {
            if (odataModel.hasPendingChanges()) { try { odataModel.resetChanges(this.UPDATE_GROUP); } catch (e) {} }
            throw new Error(error.message || "Failed to update variant.");
        } finally {
            listBinding.destroy();
        }
    }

    /**
     * @public
     * @static
     * @description Instantly revokes sharing permissions, reverting the variant to strictly private.
     * @param {ODataModel} odataModel - The active SAPUI5 OData V4 model instance.
     * @param {string} variantId - The backend UUID of the target variant.
     * @returns {Promise<void>} Resolves when the update is confirmed by the backend.
     */
    public static async revokeShareLink(odataModel: ODataModel, variantId: string): Promise<void> {
        if (!odataModel) throw new Error("OData connection not established.");
        
        const listBinding = odataModel.bindList(this.ENTITY_SET, undefined, undefined, [new Filter("VariantId", FilterOperator.EQ, variantId)], { $$updateGroupId: this.UPDATE_GROUP, $select: "*" });
        try {
            const contexts = await listBinding.requestContexts(0, 1);
            if (contexts.length === 0) throw new Error("Variant not found on server.");
            const context = contexts[0];
            context.setProperty("isUnlisted", false);
            await odataModel.submitBatch(this.UPDATE_GROUP);

            if (odataModel.hasPendingChanges(this.UPDATE_GROUP)) {
                throw new Error("Backend validation or ETag mismatch rejected the request.");
            }
        } catch (error: any) {
            if (odataModel.hasPendingChanges()) { try { odataModel.resetChanges(this.UPDATE_GROUP); } catch (e) {} }
            throw new Error(error.message || "Failed to revoke share link.");
        } finally {
            listBinding.destroy();
        }
    }

    /**
     * @public
     * @static
     * @description Elevates a private variant to Unlisted Global status to generate a secure share link.
     */
    public static async generateShareLink(odataModel: ODataModel, variantId: string): Promise<void> {
        if (!odataModel) throw new Error("OData connection not established.");
        
        const listBinding = odataModel.bindList(this.ENTITY_SET, undefined, undefined, [new Filter("VariantId", FilterOperator.EQ, variantId)], { $$updateGroupId: this.UPDATE_GROUP, $select: "*" });
        try {
            const contexts = await listBinding.requestContexts(0, 1);
            if (contexts.length === 0) throw new Error("Variant not found on server.");
            const context = contexts[0];
            context.setProperty("isUnlisted", true);
            await odataModel.submitBatch(this.UPDATE_GROUP);

            if (odataModel.hasPendingChanges(this.UPDATE_GROUP)) {
                throw new Error("Backend validation or ETag mismatch rejected the request.");
            }
        } catch (error: any) {
            if (odataModel.hasPendingChanges()) { try { odataModel.resetChanges(this.UPDATE_GROUP); } catch (e) {} }
            throw new Error(error.message || "Failed to generate share link.");
        } finally {
            listBinding.destroy();
        }
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

        const listBinding = odataModel.bindList(this.ENTITY_SET, undefined, undefined, [new Filter("VariantId", FilterOperator.EQ, variantId)], { $select: "*" });
        let context: any;
        try {
            const contexts = await listBinding.requestContexts(0, 1);
            if (contexts.length === 0) throw new Error("Variant not found on server.");
            
            context = contexts[0];
            await context.delete();
        } catch (error: any) {
            try { odataModel.resetChanges(); } catch (e) {}
            throw new Error(error.message || "Failed to delete variant.");
        } finally {
            listBinding.destroy();
        }
    }
}