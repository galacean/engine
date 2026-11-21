---
name: engine-knowledge
description: "Use when writing Galacean Scripts for gameplay, runtime state or Engine capabilities not exposed by the host Editor API. Provides cross-API lifecycle, physics, rendering and resource-ownership guidance, including Spine and XR."
---

# Engine Script Knowledge

Use this skill to compose the installed `@galacean/engine` and its supported Spine/XR APIs in Scripts. It explains runtime behavior and ownership decisions that individual API signatures do not resolve.

In Editor-managed projects, use the current host Editor API for supported, persisted scene and asset configuration. Use Scripts for gameplay, runtime state and Engine capabilities the host does not expose, including initialization needed by those behaviors. Standalone Engine applications also own scene initialization.

Use each installed package's declarations and TSDoc for exact signatures, options, defaults, units and other per-API contracts. Reuse declarations already obtained.

## Read for the current task

Read only the reference and sections needed for the current script decision. Follow another reference only when its behavior affects that decision. Verify changes with compiler diagnostics and observable runtime behavior.

- Coordinates, transform composition and screen conversion: [coordinates-and-space.md](references/coordinates-and-space.md).
- Script activation and frame order: [lifecycle-and-frame-order.md](references/lifecycle-and-frame-order.md).
- Motion ownership, fixed steps, collision callbacks and picking: [physics-setup.md](references/physics-setup.md).
- Script mesh initialization, generation, sharing and vertex updates: [mesh-geometry.md](references/mesh-geometry.md).
- Cloning, reference counts and garbage collection: [resource-ownership.md](references/resource-ownership.md).
- Materials, color space, cameras, masks, lighting and post-processing: [rendering-and-color.md](references/rendering-and-color.md).
- Spine instances, animation state and rendering: [spine.md](references/spine.md).
- XR devices, origins, cameras, sessions and input: [xr.md](references/xr.md).
