/**
 * @fileoverview Engine Registry
 * @description Decouples the Renderer from specific layout engine implementations.
 * Follows the Open-Closed Principle by allowing dynamic engine registration.
 */
import { IEngineFacade } from "./engines/IEngineFacade";
import { EngineType } from "../types";

export default class EngineRegistry {
    private static _engines: Map<string, IEngineFacade> = new Map();

    /**
     * @public
     * @static
     * @description Registers a new layout engine facade.
     * @param {string} type - The EngineType or custom string key.
     * @param {IEngineFacade} engine - The engine facade implementation.
     */
    public static registerEngine(type: string, engine: IEngineFacade): void {
        this._engines.set(type.toUpperCase(), engine);
    }

    /**
     * @public
     * @static
     * @description Retrieves an engine facade by its type.
     * @param {string} type - The EngineType.
     * @returns {IEngineFacade | null} The engine or null if not registered.
     */
    public static getEngine(type: string): IEngineFacade | null {
        return this._engines.get(type.toUpperCase()) || null;
    }

    /**
     * @public
     * @static
     * @description Returns all registered engines.
     * @returns {IEngineFacade[]} Array of all engines.
     */
    public static getAllEngines(): IEngineFacade[] {
        return Array.from(this._engines.values());
    }

    /**
     * @public
     * @static
     * @description Returns whether an engine is registered.
     * @param {string} type - The EngineType.
     * @returns {boolean} True if registered.
     */
    public static hasEngine(type: string): boolean {
        return this._engines.has(type.toUpperCase());
    }
}
