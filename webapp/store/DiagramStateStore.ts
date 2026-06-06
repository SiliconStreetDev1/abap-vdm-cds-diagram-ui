/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.store
 * @fileoverview Pure Reactive POJO Store replacing UI5 JSONModel for Diagram State.
 */

import { CommandManager } from "./CommandManager";
import { IVariantState } from "../types/IVariantState";

export interface IPosition { x: number; y: number; }

export interface INodeState {
    id: string;
    position: IPosition;
    isPinned: boolean;
    isHidden: boolean;
}

export interface IDiagramState {
    nodes: Map<string, INodeState>;
    history: CommandManager;
    variantState?: IVariantState;
}

export class DiagramStateStore {
    private static instance: DiagramStateStore;
    private _sessions: Map<string, IDiagramState> = new Map();

    private constructor() {}

    /**
     * @public
     * @description Gets the Singleton instance of the DiagramStateStore.
     */
    public static getInstance(): DiagramStateStore {
        if (!DiagramStateStore.instance) {
            DiagramStateStore.instance = new DiagramStateStore();
        }
        return DiagramStateStore.instance;
    }

    /**
     * @private
     * @description Generates a strict multi-instance session key to avoid Fiori Launchpad collision.
     */
    private _getKey(viewId: string, diagramId: string): string {
        return `${viewId}_${diagramId.toUpperCase()}`;
    }

    /**
     * @public
     * @description Retrieves the active diagram state, initializing a new one if it doesn't exist.
     */
    public getDiagramState(viewId: string, diagramId: string): IDiagramState {
        const key = this._getKey(viewId, diagramId);
        if (!this._sessions.has(key)) {
            this._sessions.set(key, {
                nodes: new Map(),
                history: new CommandManager(viewId)
            });
        }
        return this._sessions.get(key) as IDiagramState;
    }

    /**
     * @public
     * @description Updates or initializes a specific node's state within a specific diagram.
     */
    public setNodeState(viewId: string, diagramId: string, nodeId: string, stateUpdate: Partial<INodeState>): void {
        const diagramState = this.getDiagramState(viewId, diagramId);
        let nodeState = diagramState.nodes.get(nodeId);
        
        if (!nodeState) {
            nodeState = {
                id: nodeId,
                position: { x: 0, y: 0 },
                isPinned: false,
                isHidden: false
            };
        }
        
        Object.assign(nodeState, stateUpdate);
        diagramState.nodes.set(nodeId, nodeState);
    }

    /**
     * @public
     * @description Bulk updates multiple nodes in a single O(1) operation array iteration.
     */
    public setNodeStates(viewId: string, diagramId: string, updates: { nodeId: string; stateUpdate: Partial<INodeState> }[]): void {
        const diagramState = this.getDiagramState(viewId, diagramId);
        updates.forEach(u => {
            let nodeState = diagramState.nodes.get(u.nodeId);
            if (!nodeState) {
                nodeState = { id: u.nodeId, position: { x: 0, y: 0 }, isPinned: false, isHidden: false };
            }
            Object.assign(nodeState, u.stateUpdate);
            diagramState.nodes.set(u.nodeId, nodeState);
        });
    }

    /**
     * @public
     * @description Sets the VariantState cache for a diagram (used for drill-downs).
     */
    public setVariantState(viewId: string, diagramId: string, variantState: IVariantState): void {
        const diagramState = this.getDiagramState(viewId, diagramId);
        diagramState.variantState = variantState;
    }

    /**
     * @public
     * @description Gets the VariantState cache for a diagram.
     */
    public getVariantState(viewId: string, diagramId: string): IVariantState | undefined {
        return this.getDiagramState(viewId, diagramId).variantState;
    }

    /**
     * @public
     * @description Cleans up memory when a diagram session is destroyed.
     */
    public clearDiagramState(viewId: string, diagramId?: string): void {
        if (diagramId) {
            this._sessions.delete(this._getKey(viewId, diagramId));
        } else {
            // Clear all states for a specific viewId (App Instance)
            const keysToDelete: string[] = [];
            this._sessions.forEach((_, key) => {
                if (key.startsWith(`${viewId}_`)) {
                    keysToDelete.push(key);
                }
            });
            keysToDelete.forEach(k => this._sessions.delete(k));
        }
    }
}
