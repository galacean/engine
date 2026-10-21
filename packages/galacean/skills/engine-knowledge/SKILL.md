---
name: engine-knowledge
description: "Use for non-derivable runtime semantics of the exact @galacean/engine package version that ships this Skill, including Script lifecycle, coordinate conventions, physics ownership, rendering, resource ownership, and supported Spine or XR companions. Use installed declarations as the authority for exports and signatures."
---

# Engine Runtime Knowledge

This Skill is a versioned companion to `@galacean/engine`. It records runtime behavior that declarations cannot express. Engine source and generated declarations remain authoritative for exports, signatures, overloads, enum members, and deprecations. The aggregate Skill also carries runtime semantics for supported Spine and XR companions; those packages remain the authority for their exact exports and signatures.

In a hosted project, reuse the Engine and loaded objects provided by the host. Standalone applications own their initialization. This Skill does not define how a host creates, serializes, builds, or publishes project assets; those protocols belong to that host.

## Method

1. Identify the runtime decision that needs Engine-specific behavior.
2. Read the relevant sections; follow links only for a missing runtime dependency or behavior.
3. Resolve missing symbols and signatures from the installed declarations; reuse contracts already obtained for that version.
4. Prefer compiler diagnostics and observable runtime behavior over remembered examples. Do not infer APIs from prose.

## References

- For handedness, forward direction, transform composition, Euler order, and screen or viewport spaces, read [coordinates-and-space.md](references/coordinates-and-space.md).
- For Script activation and frame ordering, read [lifecycle-and-frame-order.md](references/lifecycle-and-frame-order.md).
- For collider ownership, motion, fixed steps, callbacks, and screen picking, read [physics-setup.md](references/physics-setup.md).
- For built-in mesh dimensions, orientation, and uploading drawable custom geometry, read [mesh-geometry.md](references/mesh-geometry.md).
- For cloning, reference counts, garbage collection, and shared resources, read [resource-ownership.md](references/resource-ownership.md).
- For material mutation, color-space intent, cameras, masks, runtime lighting, and post-processing, read [rendering-and-color.md](references/rendering-and-color.md).
- For Spine runtime, instance, animation-state, and render ownership, read [spine.md](references/spine.md).
- For XR device, origin, camera, session, input, and frame ownership, read [xr.md](references/xr.md).

Do not pre-read every reference. For all API shape and provider-specific behavior, use the exact installed declarations and runtime tests instead of treating these references as an API catalog.
