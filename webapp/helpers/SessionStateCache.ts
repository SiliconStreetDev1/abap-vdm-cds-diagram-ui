/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.helpers
 * @fileoverview In-memory session cache for drill-down navigation states.
 * @description Extracted from DiagramGenerationHandler to enforce SRP. Safely 
 * caches canvas coordinates and UI state during active Fiori sessions to 
 * enable seamless breadcrumb navigation.
 */
import { IVariantState } from "../types/IVariantState";

export default class SessionStateCache {
    private static _oSessionCache: Record<string, IVariantState> = {};

    /**
     * @public
     * @description Caches a snapshot of the current view's state for seamless breadcrumb restoration.
     */
    public static set(sViewId: string, sName: string, oState: IVariantState): void {
        this._oSessionCache[`${sViewId}_${sName.toUpperCase()}`] = oState;
    }

    /**
     * @public
     * @description Retrieves a cached snapshot for a given CDS view, if one exists in this session.
     */
    public static get(sViewId: string, sName: string): IVariantState | undefined {
        return this._oSessionCache[`${sViewId}_${sName.toUpperCase()}`];
    }

    /**
     * @public
     * @description Explicitly purges a specific view's state from the session cache.
     */
    public static remove(sViewId: string, sName: string): void {
        delete this._oSessionCache[`${sViewId}_${sName.toUpperCase()}`];
    }

    public static clear(sViewId: string): void {
        Object.keys(this._oSessionCache).forEach(sKey => {
            if (sKey.startsWith(`${sViewId}_`)) {
                delete this._oSessionCache[sKey];
            }
        });
    }
}