# SAP VDM CDS Diagrammer UI (FIORI)

## What it is
A Fiori application for visualizing SAP Virtual Data Models (VDM) / CDS Views. It turns complex Core Data Services (CDS) hierarchies into interactive, zoomable class diagrams.

<img width="2113" height="1824" alt="Image" src="https://github.com/user-attachments/assets/4398560e-8ced-4463-8471-5f1ffe05b4a6" />

## Extra Wide Support
<img width="7544" height="1546" alt="image" src="https://github.com/user-attachments/assets/175146f1-f759-4958-a3dd-46c355b6f0dd" />

---

## Rendering Engines
This application utilizes four distinct visual engines to render CDS relationships:

* **Cytoscape.js [EXPERIMENTAL]:** A high-performance, interactive Canvas engine. It is built for discovery and "un-tangling" massive VDM models where standard SVG rendering becomes cluttered.
* **Mermaid.js:** Renders locally in the browser. Best for quick, interactive web previews.
* **Graphviz (WASM):** Executes via WebAssembly locally. Ideal for complex multi-edge routing and structured ER layouts.
> [!WARNING]
>* **PlantUML:** By default, this engine calls the public PlantUML server (`https://www.plantuml.com/plantuml/svg/`).
>    * **Data Privacy Note:** metadata is sent over the public internet. 
>    * **Enterprise Recommendation:** Host a local PlantUML instance and update `config.json`.

---

## [EXPERIMENTAL] Cytoscape Interactivity
The Cytoscape engine transforms the diagram from a static map into a "Discovery Environment."
<img width="1500" height="815" alt="image" src="https://github.com/user-attachments/assets/ad8bafb6-8bb9-4414-a7ab-487a48d52aa7" />

### 1. Neighborhood Highlighting (Focus Mode)
Tired of the "Spaghetti" effect? Click any Entity (Node) to instantly isolate its logic.
* **The Effect:** Every unrelated table and association fades to **15% opacity**.
* **The Focus:** The selected table and its direct neighborhood (Compositions and Associations) remain at **100% opacity**.
* **Visual Pop:** Connected lines thicken and "glow" while maintaining their semantic ABAP colors (e.g., Green for Associations, Blue for Compositions).

<img width="1510" height="815" alt="image" src="https://github.com/user-attachments/assets/a55baae8-cf56-4dd9-ba65-3c599f51b7c5" />

### 2. "Springs & Magnets" Physics (`cose`)
Unlike static row-based layouts, Cytoscape treats the VDM as a physical system.
* **Elasticity:** Association lines act like springs, pulling related entities closer together.
* **Live Untangling:** Moving the **Node Spacing** slider in the UI physically recalculates these forces in real-time, wiggling the graph into the most readable state.

### 3. Smart Association Edge Labels
To maximize space inside the entity boxes, association names (e.g., `_Items`) are moved onto the **Bezier curved lines** next to the cardinality. This eliminates redundancy and makes the data flow obvious at a glance.



---

## Viewer Capabilities
* **Fluid Panning:** Click and drag the canvas to follow complex paths.
* **Precision Zooming:** Support for high-res mouse-wheel zooming.
* **Max Real Estate Mode:** A dedicated full-screen toggle for deep-dive sessions.
* **Collapsible Workspace:** Hide the configuration panel to maximize the drawing area.
* **Smart Centering:** Diagrams automatically scale and center upon generation.

## Architecture
This is the **Frontend (UI)**. It requires the **Backend (ABAP)** component found here: [abap-vdm-cds-diagram](https://github.com/SiliconStreetDev1/abap-vdm-cds-diagram)

## Configuration Overrides (`config.json`)
Manage external endpoints, CDN paths, and performance limits. 
1. Locate `webapp/config.sample.json`.
2. Copy and rename to `webapp/config.json`.
3. Modify values for your specific landscape.

---

## Setup
1. **Install:** `npm install`
2. **Configure Environment:** Add your internal SAP IP in `ui5.yaml`.
3. **Run:** `npm start`
4. **Deploy:** `npm run deploy`

## Licensing
© 2026 Silicon Street Limited. All Rights Reserved.

Usage Terms:
* **INTERNAL USE:** Permission is granted for internal business documentation within a single organization at no cost.
* **NON-REDISTRIBUTION:** You may NOT redistribute, sell, or include this source code in commercial packages.
* **PAID SERVICES:** Use of this code for paid consulting requires a Commercial License.

**FOR COMMERCIAL LICENSING INQUIRIES:** contact@siliconst.co.nz

Third-party notices for included JS libraries are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). 

---
© 2026 Silicon Street Limited.
