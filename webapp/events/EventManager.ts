/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.events
 * @fileoverview Apex Facade for all application event routing.
 * @description Replaces raw DOM events and SAP UI5 EventBus usage. Acts as the 
 * absolute single source of truth for asynchronous communication across the application.
 */
import { Subscription } from "./Subscription";
import EventBus from "sap/ui/core/EventBus";
import { IAppEventMap } from "./maps/IAppEventMap";

/**
 * Type alias for event callbacks.
 */
export type EventCallback<T = any> = (payload: T) => void;

interface IEventRegistry {
    [event: string]: EventCallback[];
}

export class EventManager {
    private static instance: EventManager;
    private registry: IEventRegistry = {};
    private isLoggingEnabled: boolean = false;
    private ui5EventBus?: EventBus;

    /**
     * @private
     * @constructor
     * @description Enforces the Singleton pattern. Consumers must use EventManager.getInstance().
     */
    private constructor() {
        // Private constructor for Singleton
        this.isLoggingEnabled = this.checkDebugMode();
    }

    /**
     * @private
     * @description Checks URL parameters and LocalStorage to automatically enable deep trace mode.
     */
    private checkDebugMode(): boolean {
        if (typeof window === "undefined") return false;
        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get("sap-ui-debug") === "true") return true;
            if (window.localStorage && window.localStorage.getItem("sap-ui-debug") === "true") return true;
        } catch (e) {
            // Ignore gracefully if running in a restricted environment
        }
        return false;
    }

    /**
     * @public
     * @static
     * @description Retrieves the absolute singleton instance of the EventManager.
     * @returns {EventManager} The active event orchestrator.
     */
    public static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }

    /**
     * @public
     * @description Bridges the internal EventManager to the Fiori UI5 EventBus if cross-pane FCL routing is required.
     * @param {EventBus} eventBus - The SAPUI5 EventBus instance retrieved from the Component.
     */
    public attachUi5Bridge(eventBus: EventBus): void {
        this.ui5EventBus = eventBus;
    }

    /**
     * @public
     * @description Toggles global diagnostic logging for all events routed through the manager.
     * @param {boolean} state - True to enable verbose console output.
     */
    public setLogging(state: boolean): void {
        this.isLoggingEnabled = state;
    }

    /**
     * @public
     * @description Subscribes a listener to a specific strongly typed event.
     * @param {K} event - The specific event identifier from IAppEventMap.
     * @param {(payload: IAppEventMap[K]) => void} callback - The function to execute when the event fires.
     * @returns {Subscription} A disposable subscription object to prevent memory leaks.
     * @template K The expected event key type.
     */
    public subscribe<K extends keyof IAppEventMap>(event: K, callback: (payload: IAppEventMap[K]) => void): Subscription {
        if (!this.registry[event]) {
            this.registry[event] = [];
        }

        this.registry[event].push(callback as EventCallback);

        // Return a disposable wrapper implementing the closure for memory safety
        return new Subscription(() => {
            this.unsubscribe(event, callback as EventCallback);
        });
    }

    /**
     * @private
     * @description Internal cleanup method called by the Subscription dispose() sequence.
     * @param {K} event - The specific event identifier.
     * @param {EventCallback} callback - The specific function reference to remove.
     */
    private unsubscribe<K extends keyof IAppEventMap>(event: K, callback: EventCallback): void {
        if (!this.registry[event]) {
            return;
        }

        const listeners = this.registry[event];
        const index = listeners.indexOf(callback);

        if (index > -1) {
            listeners.splice(index, 1);
        }

        // Garbage collection: clean up empty branches to prevent dictionary bloat
        if (listeners.length === 0) {
            delete this.registry[event];
        }
    }

    /**
     * @public
     * @description Routes an event and its payload to all active subscribers.
     * @param {K} event - The specific event identifier from IAppEventMap.
     * @param {IAppEventMap[K]} payload - The strictly typed data payload to transmit.
     * @param {boolean} [bridgeToUi5=false] - If true, the event is also broadcast across the SAPUI5 EventBus.
     * @template K The type of the event being published.
     */
    public publish<K extends keyof IAppEventMap>(event: K, payload: IAppEventMap[K], bridgeToUi5: boolean = false): void {
        const listeners = this.registry[event] ? [...this.registry[event]] : [];
        const subscriberCount = listeners.length;

        if (this.isLoggingEnabled) {
            console.groupCollapsed(`🚀 [EventManager] Fired: ${event as string}`);
            console.log("📦 Payload:", payload);
            console.log(`👥 Subscribers Notified: ${subscriberCount}`);
            if (subscriberCount === 0) {
                console.warn(`⚠️ Warning: No subscribers are listening to [${event as string}]. Potential lifecycle/attachment issue.`);
            }
            console.groupEnd();
        }

        // Route to internal subscribers
        if (subscriberCount > 0) {
            for (const callback of listeners) {
                try {
                    callback(payload);
                } catch (error) {
                    console.error(`[EventManager] Error executing listener for [${event as string}]:`, error);
                }
            }
        }

        // Bridge to the legacy UI5 EventBus if explicitly requested (e.g., FCL routing)
        if (bridgeToUi5 && this.ui5EventBus) {
            // For UI5 EventBus, we can use a generic "App" channel and the event string
            this.ui5EventBus.publish("App", event as string, payload as any);
        }
    }
}
