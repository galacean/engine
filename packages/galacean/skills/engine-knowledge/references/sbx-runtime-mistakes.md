# SBX Runtime Contract

Use this only when a concrete SBX runtime question or diagnostic matches one of
the boundaries below. Compiler and runtime diagnostics remain authoritative.
Editor construction payloads are not documented here; discover them through
`editor_api`.

## Runtime Types And Lookup

- `getComponent` takes a runtime class reference, never a string. Import custom
  script classes directly; `declare class`, `_scriptLoader.getClass`, and a
  fictional `scriptManager` do not create runtime class values.
- Entity lookup belongs to `Scene`: use `this.scene.findEntityByName` or cache
  a known parent/child/reference. `Engine.findByName` and
  `Engine.findEntityByName` do not exist.
- A Scene has no `.camera`; resolve a Camera component from its entity. Each
  Scene owns `scene.physics`; the engine-level physics manager is a deprecated
  first-scene alias.
- UI runtime classes `Button`, `Text`, and `UITransform` come from
  `@galacean/engine-ui`. They are not `@galacean/engine` exports or browser
  DOM globals.
- Component caches account for absence and lifecycle timing. Use nullable
  fields, cache in `onAwake`/`onStart`, and avoid repeated per-frame lookup.
- `getComponents` writes into an output array. `Entity.destroyed` is the
  destroy flag; Entity activation is `isActive`, while `enabled` belongs to
  Components and Scripts.

## Input And Math

- Keyboard values use the actual `Keys` export: for example `Keys.Space` and
  `Keys.KeyA`. Import `Keys`; use `isKeyDown`, `isKeyHeldDown`, or
  `isKeyUp`, not `isKeyPressed`.
- Pointer input is `inputManager.pointers`, not `pointer` or
  `mousePosition`. A Pointer has no ray; convert its position through a
  resolved Camera when projection is actually required.
- Private drag helpers should be named `handlePointerDown/Move/Up`. Reserve
  `onPointerDown/Move/Up` for exact public Script callback signatures.
- `Vector3.lerp` is static and writes to an output value. Vector3 has no
  instance `copy`; use `set` or `clone`.
- Scene roots use `rootEntities`, `addRootEntity`, and `removeRootEntity`;
  `getRootEntities`, `addEntity`, and `removeEntity` do not exist.

## Physics

- Collision peers are reached through `collision.shape.collider.entity`;
  `collision.collider`, `otherCollider`, and `ColliderShape.entity` do not
  exist.
- A trigger pair needs one trigger and one non-trigger shape, with at least one
  dynamic non-kinematic collider. Two triggers, two kinematic bodies, or two
  static colliders do not produce the expected trigger events.
- Do not teleport a kinematic DynamicCollider by assigning its transform when
  sweep/trigger behavior matters. Use the collider's supported kinematic motion
  path; use forces for physics-driven motion.
- The lightweight physics backend does not support CapsuleColliderShape. Use a
  supported Box or Sphere shape unless the project explicitly provides PhysX.

## Construction And Source Ownership

- Submit new script source as complete code through the validated script
  mutation boundary. Empty templates are not progress.
- Mount the canonical script path returned by that mutation through the current
  typed Editor API. Query its live input with `editor_api`; do not preserve
  static `script.add` payload examples here.
- Bind stable entity/component references during construction. Use runtime
  name/hierarchy lookup only when no stable reference exists; do not create a
  second setup helper merely for bindings.
- Create serialized scenes, entities, renderers, materials, colliders, and UI
  through Editor construction. Runtime scripts own gameplay state and behavior,
  not a parallel asset-authoring pipeline.
- `build/` is generated output. A diagnostic mentioning
  `build/src/scripts/Foo.ts` must be repaired in the source script asset, never
  by editing the generated file.
- The sandbox is headless Node.js. Browser globals such as `document`,
  `window`, `Image`, Canvas, and OffscreenCanvas are unavailable.

## Runtime Resource Paths

- Editor operations address project assets by canonical VFS path, normally with
  a leading slash such as `/Scenes/game.scene` or `/Textures/icon.png`.
- `ResourceManager.load` and `SceneManager.loadScene` use the same logical path
  without the leading slash. Preserve the user-visible filename and extension:
  `ResourceManager.load("Textures/icon.png")` remains correct even if Builder
  encodes the physical object as `.tex` or `.ktx2`.
- `/oss/...`, `assets/...`, encoded build files, and CDN object names are physical
  locations, not project identities. Preserve external HTTP, blob, and data URLs
  exactly instead of applying project-path normalization.

## Diagnostic Discipline

- Follow typed compiler/runtime diagnostics first. Do not pre-read API catalogs
  or scan all of `node_modules`.
- If a runtime Engine symbol is still ambiguous, use one bounded `engine_api`
  search against the current project's installed declarations; inspect only the
  selected exact symbol when its signature, overload, package, or deprecation
  affects the implementation. Read a linked domain reference for behavior and
  design reasoning, not as a substitute for the current-version symbol graph.
- `mesh is null` usually means construction supplied an invalid/missing mesh or
  material reference. `resource._addReferCount is not a function` means a raw
  object was supplied where an Engine Resource was required. Repair the
  construction reference using canonical tool-returned paths; do not construct
  fake resource objects in runtime code.
- Scene background is scene-owned construction state, not a camera clear-color
  substitute. Query the current scene tool when that payload is needed.
