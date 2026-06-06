/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.events
 * @fileoverview Encapsulates a disposable event listener to guarantee memory safety.
 * @description Adheres to explicit garbage collection practices by forcing consumers
 * to manually dispose of their listeners when unmounting or completing their lifecycle.
 */
export class Subscription {
    private readonly unsubscribeCallback: () => void;
    private isDisposed: boolean = false;

    /**
     * @constructor
     * @param {() => void} unsubscribeCallback - The closure that removes the listener from the EventManager.
     */
    constructor(unsubscribeCallback: () => void) {
        this.unsubscribeCallback = unsubscribeCallback;
    }

    /**
     * @public
     * @description Executes the unsubscription closure and marks the instance as disposed.
     * Prevents duplicate disposal calls from causing memory errors.
     * @returns {void}
     */
    public dispose(): void {
        if (this.isDisposed) {
            return;
        }
        
        this.unsubscribeCallback();
        this.isDisposed = true;
    }
}
