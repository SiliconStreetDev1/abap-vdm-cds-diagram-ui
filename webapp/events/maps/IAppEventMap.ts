import { IDiagramEventMap } from "./IDiagramEventMap";
import { IVideoEventMap } from "./IVideoEventMap";
import { ICanvasEventMap } from "./ICanvasEventMap";

export interface IAppEventMap extends IDiagramEventMap, IVideoEventMap, ICanvasEventMap {}
