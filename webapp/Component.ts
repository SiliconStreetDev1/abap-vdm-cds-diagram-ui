import BaseComponent from "sap/ui/core/UIComponent";
import { createDeviceModel } from "./model/models";
import { EventManager } from "./events/EventManager";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer
 */
export default class Component extends BaseComponent {

	public static metadata = {
		manifest: "json",
        interfaces: [
            "sap.ui.core.IAsyncContentCreation"
        ]
	};

    public init() : void {
        // call the base component's init function
        super.init();

        // Establish the Apex EventManager and attach the UI5 FCL bridge
        EventManager.getInstance().attachUi5Bridge(this.getEventBus());

        // set the device model
        this.setModel(createDeviceModel(), "device");

        // enable routing
        this.getRouter().initialize();
    }

    public destroy(): void {
        EventManager.getInstance().detachUi5Bridge();
        super.destroy();
    }
}