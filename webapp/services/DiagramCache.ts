/**
 * @fileoverview Enterprise LRU Cache for Diagram Responses.
 * @description Extracted from the DiagramService to strictly enforce the Single Responsibility Principle.
 * Manages memory constraints and serialization to guarantee payload immutability.
 */
import { IDiagramResult, IDiagramRequest } from "./DiagramService";
import Renderer from "../renderer/Renderer";
import { EventManager } from "../events/EventManager";

export default class DiagramCache {
    private static _responseCache: Map<string, string> = new Map();
    private static readonly MAX_CACHE_SIZE = 15;

    public static clear(): void {
        this._responseCache.clear();
        EventManager.getInstance().publish("cache:updated", { hasCache: false });
    }

    private static _generateKey(oRequest: IDiagramRequest): string {
        const cacheReq = { ...oRequest };
        if (Renderer.supportsLiveUpdate(cacheReq.engine)) {
            cacheReq.formatConfigJson = ""; // Prevent cosmetic UI changes from busting the network cache
        }
        return JSON.stringify(cacheReq);
    }

    public static get(oRequest: IDiagramRequest): IDiagramResult | null {
        const sRequestHash = this._generateKey(oRequest);
        const sCachedResponse = this._responseCache.get(sRequestHash);
        
        if (sCachedResponse) {
            // Enterprise Fix: Re-insert the key to promote it to "Most Recently Used" in the JS Map iteration order
            this._responseCache.delete(sRequestHash);
            this._responseCache.set(sRequestHash, sCachedResponse);
            try {
                return JSON.parse(sCachedResponse) as IDiagramResult;
            } catch (e) {
                this._responseCache.delete(sRequestHash);
            }
        }
        return null;
    }

    public static has(oRequest: IDiagramRequest): boolean {
        const sRequestHash = this._generateKey(oRequest);
        return this._responseCache.has(sRequestHash);
    }

    public static set(oRequest: IDiagramRequest, oResult: IDiagramResult): void {
        const sRequestHash = this._generateKey(oRequest);
        
        // ENTERPRISE FIX: Ensure key is promoted to the end of the Map even if it already exists
        this._responseCache.delete(sRequestHash);

        // Commit to Cache & enforce maximum memory cap to prevent heap bloat
        this._responseCache.set(sRequestHash, JSON.stringify(oResult));
        
        if (this._responseCache.size > this.MAX_CACHE_SIZE) {
            const firstKey = this._responseCache.keys().next().value;
            if (firstKey !== undefined) {
                this._responseCache.delete(firstKey);
            }
        }
        
        EventManager.getInstance().publish("cache:updated", { hasCache: this._responseCache.size > 0 });
    }
}