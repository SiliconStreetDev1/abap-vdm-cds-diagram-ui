# VDM Diagram Generator for SAP Fiori
### Part of the ABAP VDM CDS Diagram Suite

This repository contains the SAPUI5/Fiori frontend application designed to visualize complex SAP S/4HANA Virtual Data Models (VDM). It works in conjunction with the [ABAP VDM CDS Diagram Backend](https://github.com/SiliconStreetDev1/abap-vdm-cds-diagram).

## 🚀 Key Features
* **Interactive Visualization:** Responsive, zoomable VDM webs using D3.js.
* **Metadata Toggles:** Real-time filtering of Keys, Fields, and Data Sources.
* **Engine Flexibility:** Supports Mermaid.js, Graphviz (WASM), and PlantUML.
* **Enterprise Persistence:** Full Variant Management via local storage.
* **Vector Export:** High-fidelity SVG downloads for technical documentation.

---

## 🛠 Local Setup & Deployment
To protect internal network details, this project uses an environment-based configuration.

1. **Install Dependencies:** `npm install`
2. **Configure Local Dev:** * Create a `ui5-local.yaml` based on the configuration in the documentation.
   * Add your internal SAP IP and credentials there.
3. **Run App:** `npm start`
4. **Build & Deploy:** `npm run deploy`

---

## ⚖️ Licensing & Legal
This project is licensed under the **Silicon Street Limited License**. 

This software incorporates third-party open-source components. Per the legal requirements of those licenses, the full legal notices, copyrights, and permission notices are maintained in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

**Commercial Rights:** Commercial resale and distribution are permitted under the Silicon Street Limited License, provided all attribution notices remain intact.

---

**Built by Silicon Street Limited.**
