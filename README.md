# SAP VDM CDS Diagrammer UI (FIORI)

## What it is
A Fiori application for visualizing SAP Virtual Data Models (VDM) / CDS Views. It turns complex Core Data Services (CDS) hierarchies into interactive, zoomable class diagrams.
<img width="2113" height="1824" alt="Image" src="https://github.com/user-attachments/assets/4398560e-8ced-4463-8471-5f1ffe05b4a6" />

## Architecture
This is the **Frontend (UI)**. It requires the **Backend (ABAP)** component found here: [abap-vdm-cds-diagram](https://github.com/SiliconStreetDev1/abap-vdm-cds-diagram)

## Backend & ABAP Cloud Limitations
This UI reflects the capabilities of the connected ABAP backend. For details on **ABAP Cloud compatibility, limitations, and on‑premise differences**, please refer to the Backend documentation.

## Rendering Engines & External Dependencies
This application utilizes three distinct visual engines to render CDS relationships:

* **Mermaid.js:** Renders locally in the browser. Best for quick, interactive web previews.
* **Graphviz (WASM):** Executes via WebAssembly locally. Ideal for complex multi-edge routing.
* **PlantUML:** By default, this engine calls the public PlantUML server (`https://www.plantuml.com/plantuml/svg/`) to generate diagrams.
    * **Data Privacy Note:** Using the public server sends your CDS metadata (View names, fields, and associations) over the public internet. 
    * **Enterprise Recommendation:** For production use with sensitive SAP VDM data, it is highly recommended to host a local PlantUML server instance and update the `CONFIG.URL_PLANTUML_SERVER` in the `Renderer.ts` file to your internal endpoint.
  

## Why use it
* **Visualizes Relationships:** Maps Associations, Compositions, and Inheritances.
* **Metadata Control:** Toggles Keys, Fields, and Data Sources on or off.
* **Three Rendering Engines:** Supports Mermaid.js, Graphviz (WASM), and PlantUML.
* **Export:** Downloads high-resolution SVG files for technical documentation.
* **Search:** Integrated CDS View search capabilities.

## Setup
1.  **Install:** `npm install`
2.  **Configure:** Add your internal SAP IP in `ui5.yaml` or `ui5-local.yaml`. (Example files are provided; rename as needed).
3.  **Run:** `npm start`
4.  **Deploy:** `npm run deploy`

## Licensing
© 2026 Silicon Street Limited. All Rights Reserved.

Usage Terms:

* **INTERNAL USE:** Permission is granted to use this code for internal business documentation purposes within a single organization at no cost.
* **NON-REDISTRIBUTION:** You may NOT redistribute, sell, or include this source code (or derivatives thereof) in any commercial software, package, or library.
* **PAID SERVICES:** Use of this code to provide paid consulting or documentation services to third parties requires a Commercial License.
* **MODIFICATIONS:** Any modifications remain subject to this license.
* **DISCLAIMER:** THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE USE OF THE SOFTWARE.

**FOR COMMERCIAL LICENSING INQUIRIES:** admin@siliconst.co.nz

Third-party notices for included JS libraries are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). 

---
© 2026 Silicon Street Limited.
