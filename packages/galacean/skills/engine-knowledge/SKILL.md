---
name: engine-knowledge
description: "Use when writing Galacean runtime code that needs lifecycle, motion, rendering or resource-ownership behavior beyond API signatures. Includes version-matched Spine and XR guidance."
---

# Engine Runtime Knowledge

Runtime semantics for the installed `@galacean/engine` and its supported Spine/XR companions. Use each installed package's declarations for exact API names and signatures; reuse declarations already obtained.

In Editor-managed projects, Scripts instantiate and control authored content. Keep persistent, reusable setup in the Editor API. Runtime construction remains appropriate for procedural content, content determined at runtime, or capabilities the host does not expose. Standalone applications own their scene construction.

## Read for the current task

Choose the reference for the current runtime decision; follow links only when another behavior affects it. Verify changes with compiler diagnostics and observable runtime behavior.

- Coordinates, transform composition and screen conversion: [coordinates-and-space.md](references/coordinates-and-space.md).
- Script activation and frame order: [lifecycle-and-frame-order.md](references/lifecycle-and-frame-order.md).
- Motion ownership, fixed steps, collision callbacks and picking: [physics-setup.md](references/physics-setup.md).
- Primitive dimensions and drawable custom geometry: [mesh-geometry.md](references/mesh-geometry.md).
- Cloning, reference counts and garbage collection: [resource-ownership.md](references/resource-ownership.md).
- Materials, color space, cameras, masks, lighting and post-processing: [rendering-and-color.md](references/rendering-and-color.md).
- Spine instances, animation state and rendering: [spine.md](references/spine.md).
- XR devices, origins, cameras, sessions and input: [xr.md](references/xr.md).
