# SAP VDM CDS Diagrammer UI (FIORI)

## What it is
A Fiori application for visualizing SAP Virtual Data Models (VDM) / CDS Views. It turns complex Core Data Services (CDS) hierarchies into interactive, zoomable and interactive class diagrams.

<img width="2113" height="1824" alt="Image" src="https://github.com/user-attachments/assets/4398560e-8ced-4463-8471-5f1ffe05b4a6" />

## Extra Wide Support
<img width="7544" height="1546" alt="image" src="https://github.com/user-attachments/assets/175146f1-f759-4958-a3dd-46c355b6f0dd" />

---

## Rendering Engines
This application utilizes four distinct visual engines to render CDS relationships:

* **Cytoscape.js [EXPERIMENTAL]:** A high-performance, interactive Canvas engine. It is built for discovery and "un-tangling" massive VDM models where standard SVG rendering becomes cluttered. Features deep interactivity including double-click drill-down capabilities, breadcrumb navigation, and a minimap.
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

### 3. Hierarchical Routing (`dagre`)
By default, the engine uses the **Dagre** layout algorithm to present a strict, hierarchical view of your CDS architecture.
* **Structured Flow:** Organizes views into logical tiers (e.g., Base, Composite, Consumption) flowing from top-to-bottom or left-to-right.
* **Minimized Crossings:** Automatically calculates edge routing to reduce visual clutter and overlapping lines.

### 4. Smart Association Edge Labels
To maximize space inside the entity boxes, association names (e.g., `_Items`) are moved onto the **Bezier curved lines** next to the cardinality. This eliminates redundancy and makes the data flow obvious at a glance.

### 5. Deep Drill-Down & Breadcrumbs
* **Double-Click to Drill:** Double-clicking any entity (Node) will instantly execute a new backend fetch, pivoting the entire diagram around that selected entity as the new root. This allows you to fluidly navigate through the VDM hierarchy. *(Note: Drill-down automatically enforces a hierarchical layout to ensure newly discovered child entities route cleanly without overlapping).*
* **Breadcrumb Trail:** As you navigate deeper into the VDM hierarchy using the drill-down feature, a breadcrumb navigation trail dynamically builds at the top of the canvas. You can click any previous node in the trail to instantly jump back up the architecture.

### 6. Bird's-Eye Minimap
When exploring massive enterprise models, use the **Minimap Toggle** in the toolbar to open a draggable, resizable Navigator window in the corner. This provides a high-level overview of the entire graph and allows for rapid panning across complex landscapes without losing your bearings.

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

## 📄 License & Terms

© 2026 Silicon Street Limited. All Rights Reserved.

**Usage Terms:**
1. **INTERNAL USE:** Permission is granted to use this code for internal business documentation purposes within a single organization at no cost.
2. **NON-REDISTRIBUTION:** You may **NOT** redistribute, sell, or include this source code (or derivatives thereof) in any commercial software, package, or library.
3. **PAID SERVICES:** Use of this code to provide paid consulting or documentation services to third parties requires a **Commercial License**.
4. **MODIFICATIONS:** Any modifications remain subject to this license.

**DISCLAIMER:** THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY ARISING FROM THE USE OF THE SOFTWARE.

**FOR COMMERCIAL LICENSING INQUIRIES:** contact@siliconst.co.nz


Third-party notices for included JS libraries are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). 

### 7. Custom Layouts & Variant Persistence
* **Drag and Drop Positioning:** Entities can now be freely dragged and positioned anywhere on the canvas.
* **Layout Snapshots (Fiori Variants):** Physical canvas X/Y coordinates, pinned states, and visibility states can be saved to local storage as View Variants.
* **Undo/Redo Stack:** Integrated `Ctrl+Z` support utilizing a Memento pattern to safely rollback accidental canvas movements, layout changes, or note deletions.
* **Grid Snapping:** Toggleable alignment guides and strict snap-to-grid constraints for precise architectural mapping.

### 8. Visual Annotations (Sticky Notes)
* **Interactive Sticky Notes:** Add, edit, and delete draggable sticky notes directly over the CDS diagram. Supports typography switching and semantic color-coding.
* **Entity Linking:** Visually anchor sticky notes to specific CDS views. Linked notes automatically travel with the entity when dragged, and will intelligently hide/restore if the parent entity's visibility is toggled.

### 9. Contextual Actions & Visibility
* **Right-Click Fiori Context Menu:** Pin/Unlock specific nodes in place while allowing the physics engine to route other entities around them.
* **Hidden Node Manager:** Hide irrelevant CDS views via the context menu, and use the dedicated manager Dialog to review and selectively restore hidden entities. Hiding a node will automatically cascade and hide any sticky notes specifically linked to it.

### 10. Search & Export
* **Graph Search:** A dedicated search bar allows you to quickly locate, zoom, and highlight specific entities within massive, complex architectures.
* **High-Res Export:** Native support for exporting the current viewport or the entire graph as a high-resolution PNG or a scalable SVG (with built-in zoom/pan browser support).

### 11. Multi-Algorithm Layouts
Beyond `dagre` and `cose`, the Cytoscape engine supports switching between distinct mathematical layout algorithms in real-time:
* **ELK (Eclipse Layout Kernel):** Advanced orthogonal and layered routing.
* **Grid & Circular:** Structured topology generation for strict alignment.
* **Breadthfirst:** Interactive tree expansion representations.

### 12. How Variants Work (State Persistence)
The Variant system acts as a comprehensive persistence layer that takes a deep snapshot of your current analysis session directly into local storage. 

> **Note:** Variants are currently saved to your browser's **local storage** for now. They are specific to your machine/browser and are not yet synced globally to the SAP backend.

When you save a Variant, it captures:
* **Context & Filters:** The root CDS view, expansion level, and any include/exclude search tokens.
* **UI Settings:** All active toggles (Keys, Fields, Associations, Relational Modes) and the currently selected rendering engine.
* **Visual Formatting:** Real-time layout configurations (e.g., node spacing, algorithms, theme, line styles).
* **Physical Canvas State (Cytoscape):** If "Save exact node positions" is checked, the system records the precise X/Y coordinates of every entity, the camera's zoom/pan level, pinned/hidden node states, and any custom Sticky Notes linked to the diagram.

**Usage:**
1. Adjust your diagram (filter properties, move nodes, hide entities, add sticky notes).
2. Click the **Save (Disk Icon)** in the Variants toolbar.
3. Provide a name. If you have manually dragged nodes, you will be given the option to save the exact "Custom Layout" positions. *(Note: Variant saving is strictly disabled during Drill-Down mode to protect your root architectural layouts).*
4. Restore this exact architectural state at any time by selecting the variant from the dropdown. You can also instantly wipe away any accidental or unsaved canvas changes by clicking the **Revert (Undo Icon)** next to the variant selector.

---
© 2026 Silicon Street Limited.
