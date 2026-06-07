/**
 * @fileoverview Interface defining the contract for all isolated Gamification Plugins.
 * @description Adheres to the Open-Closed Principle, allowing new visual and audio
 * effects to be injected dynamically without altering core renderer logic.
 */
import type { Core } from "cytoscape";

export interface IEffectPlugin {
    /**
     * @public
     * @description A unique technical ID for the plugin (e.g. "radar-ping")
     */
    getId(): string;

    /**
     * @public
     * @description A human-readable name for the UI Settings Dialog
     */
    getName(): string;

    /**
     * Optional initialization hook.
     */
    onInit?: (cyInstance: Core) => void;

    /**
     * Triggered rapidly while a node is actively being dragged.
     */
    onNodeDrag?: (nodeId: string, position: { x: number; y: number }) => void;

    /**
     * Triggered when nodes are dropped.
     */
    onNodesDrop?: (payload: { nodes: { nodeId: string; oldPos: { x: number; y: number }; newPos: { x: number; y: number } }[] }) => void;

    /**
     * Triggered when the mathematical physics engine detects a node has fully crossed an edge line.
     */
    onEdgeCrossed?: (nodeId: string) => void;

    /**
     * Triggered when the search manager finds matching nodes.
     */
    onSearchHighlight?: (nodeIds: string[]) => void;

    /**
     * Cleanup hook.
     */
    onDestroy?: () => void;
}
