---
name: engine-knowledge
description: "Use when implementing or debugging runtime Galacean Script behavior for the Engine version that ships this Skill: lifecycle, input, physics, camera, collision, coordinates, and engine types. Do not use for Editor API payload schemas or CLI transaction workflow."
---

# Galacean Runtime Script Knowledge

This Skill owns runtime Engine behavior. Scene construction and serialized
assets belong to Editor APIs; CLI transactions belong to `galacean-cli`.

## Workflow

1. Identify the runtime behavior and the script or component that owns it.
2. Read one routed reference only when it resolves a concrete behavior question
   or diagnostic. `references/sbx-runtime-mistakes.md` is a targeted map for a
   matching SBX trap, not a mandatory pre-write checklist. Do not preflight every
   referenced Engine class or member.
3. Submit source through the current agent's validated script-mutation boundary.
   New assets use `action:"create"` with complete code; existing assets use
   `action:"update"` with focused edits or an intentional full replacement.
   Validation must pass before the asset is accepted. If one concrete compiler
   or runtime diagnostic still depends on an exact current-version export,
   class, member, overload, or signature, use one bounded `engine_api` query
   instead of reading declaration files, then repair the coherent draft.
4. Mount the returned canonical script path with the typed Editor API and bind
   stable entity/component references during the same construction transaction.
5. Verify the requested behavior with project build and, when behavioral,
   browser evidence.

## Stable Runtime Boundaries

- A custom script extends `Script` and uses a default-exported class. Lifecycle
  callbacks are public runtime methods.
- Runtime scripts own runtime state and behavior. Create scenes, render assets,
  colliders, UI components, and serialized script mounts through Editor/CLI
  construction before play.
- `getComponent` takes a runtime class reference, not a string. Cross-script
  collaboration imports the default class or uses an explicitly bound reference.
- UI runtime classes such as `Button`, `Text`, and `UITransform` come from
  `@galacean/engine-ui`, not `@galacean/engine`.
- Runtime resource and scene loading uses the build manifest's stable logical
  path. It equals the Editor canonical VFS path without its leading slash and
  keeps the user-visible extension (for example `/Textures/icon.png` becomes
  `Textures/icon.png`). Encoded extensions and CDN locations are Builder-owned
  physical mappings; `/oss/...` is only an import source.
- Give movement, damage, score, event registration, and scene transition one
  authoritative owner each. Do not let transform writes and physics simulation
  compete for the same entity.
- Component caches account for missing components and lifecycle timing; do not
  hide uncertainty with unchecked casts or fictional internal APIs.
- Galacean is right-handed and a Camera renders along its local `-Z`. The game
  world's forward direction, camera placement, and light orientation still come
  from the actual scene design; there is no universal world-forward template.

## Reference Router

| Need | Read |
|------|------|
| A matching SBX runtime or package trap | `references/sbx-runtime-mistakes.md` |
| Reusable script shapes | `references/script-templates.md` |
| Colliders, triggers, and dynamic physics | `references/physics-setup.md` |
| Geometry default dimensions | `references/geometry-sizes.md` |
| Deep Engine behavior not covered above | `references/galacean-knowledge/index.md` |
| Exact current-project Engine symbol or signature | `engine_api` tool |

Do not pre-read every reference, scan `node_modules`, or open whole declaration
files. Use compiler/runtime diagnostics and `engine_api` to select the smallest
fact that can resolve the next decision.
