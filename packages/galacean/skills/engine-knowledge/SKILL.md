---
name: engine-knowledge
description: "Use for non-derivable runtime semantics of the exact @galacean/engine package version that ships this Skill, especially Script lifecycle, coordinate conventions, and physics ownership. Use the installed declarations as the authority for exports and signatures."
---

# Engine Runtime Knowledge

This Skill is a versioned companion to `@galacean/engine`. It records runtime behavior that declarations cannot express. Engine source and generated declarations remain authoritative for exports, signatures, overloads, enum members, and deprecations. Optional packages own their own capabilities.

This Skill does not define how a host creates, serializes, builds, or publishes project assets. Those protocols belong to the host that provides them.

## Method

1. Identify the runtime decision that needs Engine-specific behavior.
2. Read only the reference that covers that decision.
3. Resolve exact symbols and signatures from the installed declarations.
4. Prefer compiler diagnostics and observable runtime behavior over remembered examples. Do not infer APIs from prose.

## References

- For Script activation and frame ordering, read [lifecycle-and-frame-order.md](references/lifecycle-and-frame-order.md).
- For collider ownership, motion, fixed steps, and callbacks, read [physics-and-collision.md](references/physics-and-collision.md).
- For built-in mesh dimensions and orientation, read [primitive-geometry.md](references/primitive-geometry.md).
- For cloning, reference counts, garbage collection, and shared resources, read [resource-ownership.md](references/resource-ownership.md).
- For material sharing, color-space intent, and final output, read [rendering-and-color.md](references/rendering-and-color.md).

Do not pre-read every reference. For all API shape and provider-specific behavior, use the exact installed declarations and runtime tests instead of treating these references as an API catalog.
