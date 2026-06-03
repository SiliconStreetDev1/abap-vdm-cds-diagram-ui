/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.renderer.engines
 * @fileoverview D2 script rendering implementation.
 * @description D2 requires a local CLI/Server to compile. This engine acts 
 * as a graceful headless pass-through for downloading D2 syntax files.
 */
import { IEngineFacade } from "./IEngineFacade";

export default class D2Engine {
    public static configPath = "/formatD2";
    public static supportsMinimap = false;
    public static supportsSearch = false;
    public static supportsSourceExport = true;
    public static supportsImageExport = false;

    public static getMaxPayloadSize(): number {
        return 1000;
    }

    public static render(sViewId: string, sPayload: string, sRenderId: string, fnOnError: (msg: string) => void): void {
        fnOnError("msgD2Warning");
    }
    
    public static destroy(sViewId: string): void {}
}