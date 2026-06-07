import Opa5 from "sap/ui/test/Opa5";

const sViewName = "App";

/**
 * @namespace nz.co.siliconstreet.vdmdiagrammer.test.integration.pages
 * @class AppPage
 * @description Enterprise definition for AppPage.
 */
export default class AppPage extends Opa5 {
	// Actions


	// Assertions
	iShouldSeeTheApp() {
		return this.waitFor({
			id: "app",
			viewName: sViewName,
			success: function () {
				Opa5.assert.ok(true, "The " + sViewName + " view is displayed");
			},
			errorMessage: "Did not find the " + sViewName + " view"
		});
	}

}

