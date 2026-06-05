# SAP VDM CDS Diagrammer UI (FIORI)

## What it is
A Fiori application for visualizing SAP Virtual Data Models (VDM) / CDS Views. It turns complex Core Data Services (CDS) hierarchies into interactive, zoomable and interactive class diagrams.

<img width="2113" height="1824" alt="Image" src="https://github.com/user-attachments/assets/4398560e-8ced-4463-8471-5f1ffe05b4a6" />

## Extra Wide Support
<img width="7544" height="1546" alt="image" src="https://github.com/user-attachments/assets/175146f1-f759-4958-a3dd-46c355b6f0dd" />

---

## Rendering Engines
This application utilizes four distinct visual engines to render CDS relationships:

* **Cytoscape.js:** An interactive Canvas engine. It is built for navigating large VDM models where standard SVG rendering becomes cluttered. Features include double-click drill-down capabilities, breadcrumb navigation, and a minimap.
* **Mermaid.js:** Renders locally in the browser. Best for quick, interactive web previews.
* **Graphviz (WASM):** Executes via WebAssembly locally. Ideal for complex multi-edge routing and structured ER layouts.
> [!WARNING]
> **PlantUML:** If selected, this engine calls the public PlantUML server (`https://www.plantuml.com/plantuml/svg/`).
> * **Data Privacy Note:** SAP metadata is sent over the public internet. 
> * **Enterprise Recommendation:** Host a local PlantUML instance and update `config.json` before enabling this engine.

---

## Cytoscape Interactivity
The Cytoscape engine transforms the diagram from a static map into a "Discovery Environment."
<img width="1500" height="815" alt="image" src="https://github.com/user-attachments/assets/ad8bafb6-8bb9-4414-a7ab-487a48d52aa7" />

### 1. Focus Mode
Select an Entity (Node) to isolate its dependencies.
- **Effect:** Unrelated tables and associations fade to **15% opacity**.
- **Focus:** The selected table and its direct neighborhood (Compositions and Associations) remain at **100% opacity**.
- **Highlighting:** Connected lines thicken while maintaining their semantic ABAP colors (e.g., Green for Associations, Blue for Compositions).

<img width="1510" height="815" alt="image" src="https://github.com/user-attachments/assets/a55baae8-cf56-4dd9-ba65-3c599f51b7c5" />

### 2. "Springs & Magnets" Physics (`cose`)
Cytoscape uses a physics-based layout for the VDM.
* **Elasticity:** Association lines act like springs, pulling related entities closer together.
* **Live Updates:** Moving the **Node Spacing** slider in the UI recalculates these forces in real-time to adjust the graph layout.

### 3. Hierarchical Routing (`dagre`)
The engine uses the **Dagre** layout algorithm to present a hierarchical view of the CDS architecture.
* **Structured Flow:** Organizes views into logical tiers (e.g., Base, Composite, Consumption) flowing from top-to-bottom or left-to-right.
* **Minimized Crossings:** Calculates edge routing to reduce visual clutter and overlapping lines.

### 4. Association Edge Labels
To conserve space inside the entity boxes, association names (e.g., `_Items`) are placed on the **Bezier curved lines** next to the cardinality. This reduces redundancy and clarifies the data flow.

### 5. Drill-Down & Breadcrumbs
* **Double-Click to Drill:** Double-clicking any entity (Node) executes a backend fetch, setting that entity as the new root. This allows you to navigate through the VDM hierarchy. *(Note: Drill-down enforces a hierarchical layout to ensure newly discovered child entities route without overlapping).*
* **Breadcrumb Trail:** As you navigate deeper into the VDM hierarchy using the drill-down feature, a breadcrumb navigation trail dynamically builds at the top of the canvas. You can click any previous node in the trail to instantly jump back up the architecture.

### 6. Minimap
When exploring large models, use the **Minimap Toggle** in the toolbar to open a draggable, resizable Navigator window. This provides a high-level overview of the entire graph and allows for panning across complex diagrams.


### 7. Custom Layouts & Variant Persistence
* **Drag and Drop Positioning:** Entities can now be freely dragged and positioned anywhere on the canvas.
* **Layout Snapshots (Fiori Variants):** Physical canvas X/Y coordinates, pinned states, and visibility states can be saved directly to the SAP ABAP Backend as View Variants.
* **Deep Link Sharing:** Generate shareable URLs for specific diagrams that open in a locked-down, read-only Viewer Mode.
* **Undo/Redo Stack:** Integrated `Ctrl+Z` support (and a dedicated UI toolbar button) utilizing a Memento pattern to safely rollback accidental canvas movements, layout changes, or note deletions.
* **Grid Snapping:** Toggleable alignment guides and strict snap-to-grid constraints for precise architectural mapping.

### 8. Visual Annotations (Sticky Notes)
* **Interactive Sticky Notes:** Add, edit, and delete draggable sticky notes directly over the CDS diagram. Supports typography switching and semantic color-coding.
* **Entity Linking:** Visually anchor sticky notes to specific CDS views. Linked notes automatically travel with the entity when dragged, and will intelligently hide/restore if the parent entity's visibility is toggled.

### 9. Contextual Actions & Visibility
* **Right-Click Fiori Context Menu:** Pin/Unlock specific nodes in place while allowing the physics engine to route other entities around them.
* **Hidden Node Manager:** Hide irrelevant CDS views via the context menu (or the `Delete`/`Backspace` keys), and use the dedicated manager Dialog to review and selectively restore hidden entities. Hiding a node will automatically cascade and hide any sticky notes specifically linked to it.

### 10. Search & Export
* **Graph Search:** A dedicated search bar allows you to locate, zoom, and highlight specific entities within large architectures.
* **High-Res Export:** Native support for exporting the current viewport or the entire graph as a high-resolution PNG or a scalable SVG (with built-in zoom/pan browser support).

### 11. Layout Algorithms
The Cytoscape engine supports switching between distinct layout algorithms in real-time:
* **ELK (Eclipse Layout Kernel):** Advanced orthogonal and layered routing.
* **Grid & Circular:** Structured topology generation for strict alignment.
* **Breadthfirst:** Interactive tree expansion representations.

### 12. Keyboard Shortcuts
The canvas supports several native keyboard shortcuts for rapid architecture modeling:
* `V` or `S`: Switch to Select Mode (Box Selection).
* `H` or `P`: Switch to Pan Mode (Move Canvas).
* `Hold Spacebar`: Temporarily activate Pan Mode.
* `Hold Shift`: Temporarily activate Box Select Mode.
* `Ctrl / Cmd + Click`: Multi-select or unselect specific nodes.
* `Ctrl + A`: Select all visible nodes.
* `Ctrl + Z` (or UI Undo Button): Undo the last layout action or note deletion.
* `Delete` / `Backspace`: Instantly hide selected CDS entities or delete selected sticky notes.
* `Shift + N`: Add a new sticky note.
* `Shift + T`: Toggle temporary Focus Mode on the currently selected entity.
* `Shift + H`: Open the Hidden Entities manager.
* `Shift + M`: Toggle the Bird's-Eye Minimap.

### 13. Variants, Sharing & Cloning (State Persistence)
The Variant system persists your current session state and saves it to the SAP ABAP Backend via an OData V4 API. 

> **Architecture Note (JSON CLOB Pattern):** The backend leverages SAP RAP. To accommodate the highly dynamic nature of physical canvas coordinates and layout settings, standard database columns handle metadata and security (Authorizations), while the actual diagram configuration is serialized into a single JSON String payload.

When you save a Variant, it captures:
* **Context & Filters:** The root CDS view, expansion level, and any include/exclude search tokens.
* **UI Settings:** All active toggles (Keys, Fields, Associations, Relational Modes) and the currently selected rendering engine.
* **Visual Formatting:** Real-time layout configurations (e.g., node spacing, algorithms, theme, line styles).
* **Physical Canvas State (Cytoscape):** The precise X/Y coordinates of every entity, the camera's zoom/pan level, pinned/hidden node states, and custom Sticky Notes.

**Usage:**
1. Adjust your diagram (filter properties, move nodes, hide entities, add sticky notes).
2. Click the **Save (Disk Icon)** in the Variants toolbar.
3. Provide a name. You can opt to save the exact "Custom Layout" positions and choose whether to make the variant **Global (Public)**. Public variants can be viewed and updated by other architects, but their public status cannot be revoked to prevent workflow disruption.
4. Restore this exact architectural state at any time by selecting the variant from the dropdown. 
5. **Share Link (Unlisted):** Select a private variant and click the **Share** icon. This elevates the variant to an "Unlisted" status (accessible via a direct deep link but hidden from the public dropdown) and copies the URL to your clipboard.
6. **Revoke Share:** Click the **Unlink** icon to instantly revoke share access, reverting the variant strictly to private.

**Viewer Mode & Cloning:**
When a user opens a Share Link, the application loads into **Viewer Mode**. The UI panels are hidden to maximize canvas space, and destructive actions (dragging, hiding, deleting) are locked down. 

If the recipient wishes to modify the architecture or use it as a starting point, they can click the **Clone to Workspace** button. This instantly detaches the diagram from your shared UUID, restores the interactive builder UI panels, and allows them to freely modify the canvas and save it as their own private variant.

---
---

## Viewer Capabilities
* **Fluid Panning:** Click and drag the canvas to follow complex paths.
* **Precision Zooming:** Support for high-res mouse-wheel zooming.
* **Max Real Estate Mode:** A dedicated full-screen toggle for deep-dive sessions.
* **Collapsible Workspace:** Hide the configuration panel to maximize the drawing area.
* **Smart Centering:** Diagrams automatically scale and center upon generation.

## Native Video Recording
The application features a built-in, native HTML5 Video Recording engine that executes entirely client-side with zero backend dependencies.

* **Canvas Only (Clean) Mode:** Directly captures the WebGL pixel buffer of the Cytoscape graph. The resulting video is completely clean, hiding the SAP Fiori UI, your mouse cursor, and any system notifications.
* **Entire Screen Mode:** Captures the full SAP Fiori UI, useful for training or tutorial videos.
* **Stealth Mode:** For background diagram capture, enable Stealth Mode to hide UI recording indicators and control the engine via the `Ctrl + Shift + X` hotkey.
* **Encoding & Quality Control:** Calculates bitrates based on the selected resolution (720p to 4K) and Framerate (30-60 FPS). Users can adjust the output using the Quality dropdown (Low, Medium, High, Ultra).
* **Burned-In Subtitles:** Add professional lower-third titles and descriptions to your Canvas recordings to provide context during architectural presentations.
* **Native Buffered Mode:** Captures frames in RAM, generating seekable WebM/MP4 videos without requiring WebAssembly libraries or FFmpeg.

### How to Record
1. Expand the **Video Recording** panel in the configuration sidebar.
2. Toggle **Enable Video Recording** to `Yes`. This reveals the recording controls in the main diagram toolbar.
3. Select your desired mode (`Entire Screen` or `Diagram Only`), Resolution, Framerate, and Quality. (If using Canvas mode, you can optionally enter a Video Title and Subtitle to be burned into the final file).
4. Click the **Record** button in the main toolbar above the canvas. A cinematic countdown will appear before capture begins.
5. Use the **Pause / Resume** controls during long backend fetches (Note: The engine will auto-pause during drill-downs to conserve CPU!).
6. Click **Stop** to finalize. The file will automatically compile and download to your machine.

---

## System Architecture & Design
This repository acts as the **Frontend (UI)** component, utilizing the SAPUI5 framework. It requires the **Backend (ABAP)** component found here: abap-vdm-cds-diagram

### Patterns
The codebase adheres to **SOLID** principles, ensuring performance and memory safety across Fiori Launchpad environments:
* **Strategy Pattern (`Renderer.ts`):** Decouples the UI from the rendering logic, allowing dynamic switching between Cytoscape, Graphviz, Mermaid, PlantUML, and D2.
* **Template Method Pattern (`VideoRecorder.ts`):** Enforces strict execution mutex locks and memory cleanup for native browser video capture.
* **Memento Pattern (`UndoHandler.ts`):** Provides a 25-step undo/redo stack for layout changes and navigation history.
* **Pub/Sub Orchestration (`EventBus`):** Fiori Flexible Column Layout (FCL) panes communicate entirely asynchronously, preventing tight coupling.
* **LRU Caching (`DiagramCache.ts`):** Repeated OData backend requests are served from a memory cache to reduce network requests.

### Design Diagrams
Detailed PlantUML architectural diagrams mapping the system's execution flows, class hierarchies, and state machines can be found in the `/design` directory:
* `system_architecture_context.puml` - Full system execution boundaries.
* `core_pipeline.puml` - Component Sequence Diagram.
* `event_choreography.puml` - EventBus & DOM Pub/Sub flows.
* `engine_facade_classes.puml` - Rendering Engine Class Diagram.
* `video_recorder_classes.puml` & `video_state_machine.puml` - Video Engine logic.
* `variant_persistence_pipeline.puml` - OData V4 Backend serialization flow.
* `undo_memento_sequence.puml` - State hydration pipeline.

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

## Design Patterns Glossary

### Pattern Definitions
* **Strategy Pattern**: A "plug-and-play" system. Instead of hardcoding massive `if/else` blocks to handle different scenarios, you define a common interface and swap out the "engine" behind the scenes. The main app just presses "start", and the Strategy Pattern seamlessly routes the command to whichever engine is currently plugged in.
* **Memento Pattern**: A "time machine" for data. It captures a lightweight, pure snapshot of an object's internal state at a specific moment (like taking a photograph). If a user makes a mistake, the application simply replaces the current state with the historical snapshot to instantly "undo" the action without needing to reverse-engineer the math.
* **State Pattern**: A behavior manager that eliminates complex `if/else` logic. Instead of a single class trying to juggle multiple modes, it creates dedicated 'State' classes (e.g., Windowed vs Fullscreen). The application blindly says "execute", and the currently active State knows exactly how to behave.
* **Template Method Pattern**: A strict execution blueprint. A parent class defines an unchangeable sequence of operations (e.g., 1. Lock memory, 2. Capture, 3. Clean up) to guarantee safety. However, it leaves specific steps blank so child classes can inject their own custom logic (e.g., recording a Canvas vs recording a Screen) without altering the master sequence.
* **Portal Pattern**: A UI escape hatch. Elements in a web page are often trapped and clipped by their parent containers due to CSS boundaries. The Portal pattern uses JavaScript to literally teleport a DOM element to the absolute highest layer of the webpage, rendering it immune to being cut off or trapped behind other graphics.
* **Pub/Sub (Publish/Subscribe)**: A radio broadcasting system for code. Instead of Component A talking directly to Component B (which tightly couples their memory together), Component A shouts a message into the void ("A node was dragged!"). Any component tuned into that specific channel hears the message and reacts independently.
* **LRU (Least Recently Used) Cache**: A self-cleaning memory bank. Every time data is accessed, it is moved to the "front of the line". When the cache hits its maximum capacity, it automatically deletes the data at the very back of the line (the data that hasn't been used in the longest time) to prevent the browser from running out of RAM.

### Applied Usage
| Pattern | Applied In | Enterprise Purpose |
| :--- | :--- | :--- |
| **Strategy** | `Renderer.ts` | Decouples the UI from the rendering logic, allowing dynamic switching between visual engines (Cytoscape, Graphviz, Mermaid, etc.). |
| **Memento** | `UndoHandler.ts` | Provides a 25-step global session memory-safe undo/redo timeline for physical layout changes and navigation history. |
| **State** | `FullScreenHandler.ts` | Eliminates brittle `if/else` checks by encapsulating OS-level transitions and Fiori CSS injections into isolated state classes. |
| **Template Method** | `VideoRecorder.ts` | Enforces strict execution mutex locks and memory cleanup invariants for native browser video capture. |
| **Portal** | `MinimapManager.ts`, `ViewStateHelper.ts` | Dynamically reparents DOM elements to the HTML5 Fullscreen layer to defeat OS-level `z-index` trapping. |
| **Pub/Sub** | `EventBus` | Ensures Fiori Flexible Column Layout (FCL) panes communicate asynchronously, preventing tight memory coupling. |
| **LRU Cache** | `DiagramCache.ts` | Intercepts repeated OData backend requests and serves immutable memory caches to eliminate network spam. |

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

© 2026 Silicon Street Limited.
