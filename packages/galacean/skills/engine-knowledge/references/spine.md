# Spine Runtime Semantics

Use this reference when Spine backend registration, asset loading, instance ownership, frame timing, straight-alpha textures, or rendering affects an integration. It describes Engine 2.0 `@galacean/engine-spine` packages; resolve exact signatures from installed declarations.

## Runtime registration and loading

- Import `@galacean/engine-spine` before creating the Engine so its loader registers and receives `WebGLEngine.create({ canvas, spine: new Spine38Runtime() })` (from `@galacean/engine-spine-core-3.8`) or `Spine42Runtime` (from `@galacean/engine-spine-core-4.2`). Importing a runtime package alone does not register it.
- The loader inspects the skeleton header's major.minor version to pick a registered runtime. Multiple versions (3.8 and 4.2) can coexist on one Engine; registering an already-registered version on that Engine keeps the first instance. Registrations are isolated per Engine, and existing resources keep their backend.
- `.skel` selects the `"Spine"` loader automatically; pass `type: "Spine"` when loading `.json` or `.bin` skeleton assets (content encoding is detected from the header, not the file extension).
- Explicit atlas dependencies take precedence; otherwise a single-URL load strips query/fragment from the skeleton URL and replaces the extension with `.atlas`. Atlas-relative page names resolve textures, while explicitly supplied texture URLs preserve query parameters.

## Resource, instance, and playback

- Instantiate runtime entities via `resource.instantiate()`. The `SpineResource` owns shared skeleton data, animation-state data (`resource.stateData`, also `renderer.state.data`), skins, and atlas textures; each instance gets its own `SpineSkeleton` and `SpineAnimationState`.
- Tracks, listeners, poses, bones, slots, and active slot attachments belong to the instance (`Bone` and `Slot` wrappers are reused). Create composite skins via `resource.createSkin(name)` from skins of that same resource; cross-resource skin composition is rejected.
- Access `renderer.state` and `renderer.skeleton` only while a resource is bound. Setting `renderer.resource = null` clears the binding; replacing it creates fresh state/skeleton objects and clears slot material overrides (discard old `SpineSlot` and `SpineTrackEntry` references).
- `renderer.defaultConfig` is consumed when the renderer becomes enabled (set it before activation; re-enabling reapplies non-default skin, setup pose, and track-0 animation). After changing a skin directly, restore slots to setup pose so the new setup attachments appear.
- Sequence animations via `state.setAnimation` and `state.addAnimation`, and attach per-playback callbacks on `entry.listener`. Playback calls finish configuring entries before synchronous callbacks fire; disposal callbacks may read the entry (invalid afterward), and event values are snapshots.
- `renderer.timeScale` scales both animation and 4.2 skeleton physics (`0` pauses time while still applying the pose); `state.timeScale` and `entry.timeScale` multiply animation only. Setting `entry.trackTime` jumps animation on the next update without seeking physics history.

## Frame timing and bone-edit hooks

- Spine advances in the Renderer update phase after `onLateUpdate`: advance state -> `onBeforeApply` -> apply animations -> `onUpdateLocal` -> `onUpdateWorld` (if subscribed) -> final world/constraint/physics solve -> `onUpdateComplete` -> rebuild geometry and bounds.
- Edit bones in `renderer.onUpdateLocal` (local bone edits after animation) or `renderer.onUpdateWorld` (edits using world transforms before final solve) instead of `onUpdate`/`onLateUpdate`, where animations would overwrite them; read final poses in `onUpdateComplete`.
- An enabled `SpineAnimationRenderer` rebuilds dynamic geometry every render update even when `timeScale` is `0`.

## Space, alpha, materials, and batching

- The built-in loader scales skeleton data by `0.01`: Spine X/Y map to renderer-local X/Y and local Z is synthesized from slot order (`zSpacing`), then transformed by the Entity world matrix. Convert world targets to renderer-local space before assigning bone coordinates.
- **Straight-alpha sRGB atlases required**: export atlases with Premultiply Alpha disabled and Bleed enabled. The loader rejects `pma: true` and `isSRGBColorSpace: false` textures; missing `pma` assumes straight alpha, so re-export legacy PMA images rather than editing `.atlas` metadata.
- Atlas filter and wrap settings mutate the underlying `Texture2D`; avoid sharing that texture with consumers requiring different sampling state.
- Renderers share a default `SpineMaterial` per Engine. Use `setMaterial(material)` for the renderer default (index `0`), `getInstanceMaterial()` for an independent copy, and `setMaterial(slot, material)` (`null` to clear) for a `SpineSlot` override. Numeric indices > `0` do not target slots or draw batches.
- Set `renderer.tintBlack = true` for two-color tint. Custom Spine shaders consume straight-alpha sRGB atlas textures: sample with `texture2D`, decode vertex colors to linear space, apply tint, and premultiply final RGB by final alpha for the batch blend factors. Renderer macros and batch texture/blend inputs stay on render elements without mutating shared materials.
- Clipping performs CPU triangle clipping during geometry rebuild; texture, blend-mode, or effective-material changes across slots start a new draw batch. `subDistancePriority` preserves slot batch order; use `priority` to order across renderers.

## Editor integration and migration

- Editor integrations may register additional Spine versions via the internal loader hook `ResourceManager._loaders["Spine"]._registerRuntime(engine, runtime)` (stripped from published public declarations; application code must use `WebGLEngine.create`).
- Upgrading to Engine 2.0 does not auto-migrate existing Editor projects: re-export legacy PMA textures as straight-alpha sRGB with Bleed, update atlas metadata, remove serialized component PMA settings, and load `SpineResource` through the registered loader.
