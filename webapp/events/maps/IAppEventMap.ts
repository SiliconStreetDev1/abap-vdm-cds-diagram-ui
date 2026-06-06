import { IDiagramEventMap } from "./IDiagramEventMap";
import { IVideoEventMap } from "./IVideoEventMap";
import { ICanvasEventMap } from "./ICanvasEventMap";
import { IUiEventMap } from "./IUiEventMap";

export interface IAppEventMap extends IDiagramEventMap, IVideoEventMap, ICanvasEventMap, IUiEventMap {}
