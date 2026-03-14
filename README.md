# SAP VDM CDS Diagrammer

## What it is
A Fiori application for visualizing SAP S/4HANA Virtual Data Models (VDM). It turns complex Core Data Services (CDS) hierarchies into interactive, zoomable class diagrams.

## Why use it
* **Visualizes Relationships:** Maps Associations, Compositions, and Inheritances.
* **Metadata Control:** Toggles Keys, Fields, and Data Sources on or off.
* **Three Rendering Engines:** Supports Mermaid.js, Graphviz (WASM), and PlantUML.
* **Export:** Downloads high-resolution SVG files for technical documentation.

## Architecture
This is the **Frontend (UI)**. It requires the **Backend (ABAP)** component found here: [abap-vdm-cds-diagram](https://github.com/SiliconStreetDev1/abap-vdm-cds-diagram).

## Setup
1. **Install:** `npm install`
2. **Local Config:** Copy `ui5.yaml` to `ui5-local.yaml` (ignored by Git). Put your internal SAP IP in `ui5-local.yaml`.
3. **Run:** `npm start`
4. **Deploy:** `npm run deploy`

## Licensing
Licensed under the **Silicon Street Limited License**. Third-party notices for included JS libraries are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Commercial resale is permitted.

---
© 2026 Silicon Street Limited.
