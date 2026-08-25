---
name: engine-knowledge
description: "Use for non-derivable runtime semantics of the exact @galacean/engine package version that ships this Skill, especially Script lifecycle, coordinate conventions, and physics ownership. Use the installed declarations as the authority for exports and signatures."
---

# Engine Runtime Semantics

This Skill is a small, versioned companion to `@galacean/engine`. It records
runtime behavior that types cannot express. Engine source and generated
declarations remain authoritative for exports, signatures, overloads, and
deprecations. Optional packages own their own capabilities and behavior.

This Skill does not define how a host creates, serializes, builds, or publishes
project assets. Those protocols belong to the host that provides them.

## Method

1. Identify the runtime behavior that affects the current decision.
2. Resolve exact symbols and signatures from the installed package declarations.
3. Prefer compiler diagnostics and observable runtime behavior over remembered
   examples. Do not infer APIs from prose.

## Stable Semantics

- `onAwake` runs once when the entity first becomes active in its hierarchy; it
  is not gated by the component's `enabled` state.
- `onEnable` and `onDisable` follow transitions of the combined entity-active
  and component-enabled state. `onStart` runs once before that Script's first
  frame-level update.
- Physics is opt-in through the Engine configuration. `onPhysicsUpdate` belongs
  to fixed simulation steps, so a rendered frame may contain zero, one, or
  multiple physics updates.
- A non-kinematic dynamic body is simulation-owned. A direct transform write is
  a teleport input, while velocity and forces express continuous motion. For a
  kinematic dynamic body, use its supported path-motion API when swept
  interaction matters.
- Collision data passed to a Script callback is valid only for that callback.
  Copy any values that must outlive it.
- Local and world coordinates are right-handed. Engine forward and Camera view
  direction are local `-Z`.

For all API shape and provider-specific behavior, use the exact installed
declarations and runtime tests instead of treating this Skill as an API catalog.
