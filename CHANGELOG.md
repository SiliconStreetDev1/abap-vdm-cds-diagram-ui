# Changelog

All notable changes to the SAP VDM CDS Diagrammer UI will be documented in this file.

## [1.8.0] - 2026-06-07
*Note: The features below apply specifically to the Interactive Cytoscape Engine.*

### Added
- **Layout Engines:** Integrated multiple layout engines allowing users to instantly swap how the diagram is organized depending on architectural needs.
- **Custom Layouts & Node Visibility:** Introduced free-form drag-and-drop node placement for custom layouts, alongside the ability to manually hide specific nodes as required.
- **Drill-downs & Breadcrumbs:** Double-click any view to isolate it as the new architectural root. The engine automatically generates a breadcrumb trail for instant navigation back up the hierarchy.
- **Deep Search:** Added a robust search feature to scan the entire diagram for specific text (CDS view names, field names, or associations), instantly highlighting matches for easy discovery.
- **Variant Saving & Sharing:** Users can now save their exact physical layouts to the backend and generate shareable links. Team members can open shared variants, clone them into their own workspaces, and save them as personal variants.
- **Quality of Life Enhancements:** Added a draggable minimap for massive architectures, interactive sticky notes that stay visually attached to views, an undo button/stack, and extensive keyboard shortcuts (discoverable via the context help).
- **Haptic Feedback:** Implemented subtle, toggleable haptic feedback that triggers when moving items around the canvas to provide a more tactile workspace experience.
- **Built-in Video Recording:** Added a native video recording engine capable of capturing just the diagram or the entire screen, including a silent recording option—eliminating the need for external screen recording tools.

---

*(For older version history, please see internal commit logs)*
