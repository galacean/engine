---
name: engine-knowledge
description: "Use when writing Galacean Scripts or @galacean/engine runtime code requiring Engine lifecycle, coordinate space, physics, mesh, rendering, resource ownership, Spine, or XR semantics beyond API signatures."
---

# Engine Script Knowledge

Use this skill to compose the installed `@galacean/engine` and its supported Spine/XR APIs in Scripts or standalone Engine applications. It captures runtime ownership, ordering, and cross-API contracts that individual declarations do not express.

In Editor-managed projects, use the host Editor API for supported, persisted scene and asset configuration; use Scripts for gameplay, runtime state, and Engine capabilities the host does not expose. Standalone Engine applications own scene initialization as well.

Use each installed package's declarations and TSDoc for exact signatures, options, defaults, and units.

## Read for the current task

Read only the reference needed for the current decision, following links only when another behavior affects it. Verify changes with compiler diagnostics and observable runtime behavior.

- Handedness, `-Z` forward, transform composition, Euler `Y-X-Z` order, screen/viewport space, and Transform motion: [coordinates-and-space.md](references/coordinates-and-space.md).
- `onAwake`/`onEnable`/`onStart`/fixed-step/render callback order, per-camera render hooks, and deferred `destroy()`: [lifecycle-and-frame-order.md](references/lifecycle-and-frame-order.md).
- Dynamic/kinematic/Transform motion ownership, fixed steps, temporary `Collision` data, and picking: [physics-setup.md](references/physics-setup.md).
- Script mesh initialization, procedural/custom `ModelMesh` geometry, sharing, vertex updates, bounds alignment, and collider decoupling: [mesh-geometry.md](references/mesh-geometry.md).
- `ReferResource` ref-counting, `ResourceManager` cache vs retention, `Entity.clone()` sharing, and GC: [resource-ownership.md](references/resource-ownership.md).
- Material instances, draw priority, multi-camera clear flags/masks, `SpriteMask`, color space, shadows, skybox, and local `PostProcess` volumes: [rendering-and-color.md](references/rendering-and-color.md).
- Spine 3.8/4.2 registration, loading, straight-alpha sRGB atlases (PMA rejection), bone-edit hooks, `tintBlack`, batching, and Editor migration: [spine.md](references/spine.md).
- XR devices, `origin` and camera ownership, session lifecycle, tracked input, and frame order: [xr.md](references/xr.md).
