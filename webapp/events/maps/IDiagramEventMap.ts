import { IRenderRequestPayload } from "../../types";

export interface IDiagramEventMap {
    "diagram:renderRequest": IRenderRequestPayload;
    "diagram:renderFailed": { message: string };
    "diagram:liveFormatUpdate": { engine: string, format: any };
    "diagram:nodeDrillDown": { viewName: string };
    "diagram:viewerLoading": void;
    "diagram:applyVariantState": any;
}
