/**
 * @fileoverview Entry point and Coordinator for the VDM Diagram logic.
 * @description Acts as a Façade pattern, shielding the UI5 controller from the complexities 
 * of engine routing, DOM polling, and dependency injection.
 */
import HTML from "sap/ui/core/HTML";
import DomManager from "./DomManager";
import GraphvizEngine from "../engines/GraphvizEngine";
import MermaidEngine from "../engines/MermaidEngine";
import PlantUmlEngine from "../engines/PlantUmlEngine";

export default class DiagramRendererFacade {
    
    /**
     * @public
     * @description Core routing method. Validates the UI5 DOM state via DomManager, 
     * then dispatches the raw syntax payload to the appropriate engine implementation.
     * @param {string} sEngine - Engine identifier ("MERMAID", "GRAPHVIZ", "PLANTUML").
     * @param {string} sPayload - The source code to render.
     * @param {HTML} oHtmlControl - The UI5 Wrapper.
     * @param {(msg: string) => void} fnOnError - UI5 Message Strip dispatcher.
     */
    public static renderDiagram(sEngine: string, sPayload: string, oHtmlControl: HTML, fnOnError: (msg: string) => void): void {
        DomManager.setupCanvas(oHtmlControl, fnOnError, (sRenderId: string) => {
            switch (sEngine) {
                case "MERMAID":
                    MermaidEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                case "GRAPHVIZ":
                    GraphvizEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                case "PLANTUML":
                    PlantUmlEngine.render(sPayload, sRenderId, fnOnError);
                    break;
                default:
                    fnOnError(`Unsupported rendering engine: ${sEngine}`);
            }
        });
    }
}