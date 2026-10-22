# Spine Runtime Semantics

Use this reference when runtime version, instance ownership, lifecycle timing, coordinate space, or rendering behavior affects a Spine integration. It describes the Engine 2.0 Spine packages. Resolve exact symbols from the installed `@galacean/engine-spine` declarations.

## Runtime ownership

- `@galacean/engine-spine` exposes version-independent public objects. Install the required backend and configure `WebGLEngine.create({ canvas, spine: new Spine38Runtime() })` (or `Spine42Runtime`). Import `engine-spine` before engine creation so its loader receives the configuration. Editors can add another version with `registerSpineRuntime(engine, runtime)`; registrations are isolated per engine and existing resources keep their backend. Reuse an instance for repeated registration of its version. Backend imports alone do not register them; native Spine classes are not exported from package roots.
- The loader reads the JSON or binary header and selects a backend registered for the resource manager's Engine by export major/minor version. Both versions can coexist within one Engine. Re-registering the same instance on that Engine is allowed; registering a different instance for the same version on that Engine throws. Other Engines have independent registrations. Existing resources retain their selected backend and playback state when another version is registered. Missing backends fail explicitly and are not downloaded automatically.
- Importing the shared package registers its Engine classes and the Spine loader. Only `.skel` selects this loader automatically. For `.json` or `.bin`, specify `type: "Spine"`. Skeleton content can be JSON or Spine binary data; the extension does not determine its encoding.
- Explicit atlas dependencies take precedence. Otherwise, a single skeleton URL resolves to the same path with an `.atlas` extension, excluding the skeleton URL's query and fragment. Atlas-relative page names resolve textures; explicitly supplied texture URLs retain their query parameters for requests.

## Resource and instance ownership

- Create runtime entities through the resource's instantiate operation. The resource owns shared skeleton data, animation-state data, and its discovered atlas textures; each instance receives a fresh skeleton and animation state.
- Tracks, listeners, poses, bones, slots, and each slot's active attachment selection are instance state. Bone and slot wrappers are reused. Skins and mix configuration (`resource.stateData`, also reached through `renderer.state.data`) belong to the resource and are shared by its instances.
- Create composite skins with `resource.createSkin(name)` and add skins from that same resource. Cross-resource skin composition is rejected. Atlas objects and native attachments are internal; use the public skin and named-attachment operations.
- Access `renderer.state` and `renderer.skeleton` only with a bound resource. Assigning `renderer.resource = null` clears the binding; replacing it creates new pose/playback objects and clears slot material overrides. Do not reuse slots or playback entries from the previous binding.

## Activation and animation

- Default configuration is consumed when the renderer becomes enabled, not whenever a field changes. Set it before activation. Re-enabling reapplies the configured non-default skin and setup pose and restarts the configured track-zero animation.
- After directly changing a skin, restore slots to setup pose before expecting the new setup attachments to appear.
- Spine advances in the Renderer update phase after Script `onLateUpdate`: update state, apply it to the skeleton, update world transforms, then rebuild geometry and bounds. Animation-controlled bone values can therefore overwrite earlier Script edits in the same frame.
- An enabled renderer rebuilds its dynamic geometry each render update even when animation time is paused. Pausing time alone does not remove that geometry cost.
- Arrange playback with `state.setAnimation` and `state.addAnimation`; the renderer drives it automatically. `renderer.timeScale` scales animation and skeleton time, including 4.2 physics. Zero pauses time but still applies the pose. `state.timeScale` and `entry.timeScale` only provide additional animation scaling. Setting `entry.trackTime` changes the animation time on the next update; it does not seek physics history.
- Prefer queues for a known sequence and `entry.listener` for callbacks belonging to one playback. Playback commands finish configuring entries before synchronous callback dispatch. Disposal callbacks can read the entry; afterward it is invalid. Authored event values are snapshots and may be retained.

## Space and rendering

- The built-in loader scales skeleton data by `0.01`. Spine X and Y become renderer-local X and Y; local Z is synthesized from slot draw order, then the Entity world transform is applied. Convert world-space targets to renderer-local space before assigning bone coordinates.
- Spine requires straight-alpha sRGB atlas textures for linear rendering. Export with Premultiply alpha disabled and Bleed (color bleed into transparent pixels) enabled. The loader rejects `pma: true` and textures with `isSRGBColorSpace: false`. Missing `pma` assumes straight alpha, so re-export legacy PMA images instead of just changing metadata. No alpha-mode override or renderer PMA switch exists. Textures use normal loading, sharing and restoration; there is no GPU readback or conversion texture.
- Renderers share a default `SpineMaterial` within an Engine. Use `setMaterial(material)` for the default, `getInstanceMaterial()` for an independent copy, and `setMaterial(slot, material)` for an override on a `SpineSlot` from that renderer. Passing null for a slot removes its override. Numeric material indices do not identify slots or dynamic draw batches; only index 0 is used as the default.
- Enable `renderer.tintBlack` for two-color tint. Custom Spine shaders consume straight-alpha sRGB atlas textures and vertex colors. Sample with `texture2DSRGB`, decode vertex colors to linear space, apply tint, then premultiply final RGB by final alpha for the supplied batch blend factors. Renderer macros and batch texture/blend inputs do not mutate shared materials.
- Clipping performs CPU triangle clipping during geometry rebuild. A texture, blend-mode or effective-material transition in slot order starts another draw segment, so atlas-page count and slot interleaving affect draw calls. The renderer preserves its batch order with `subDistancePriority`; use `priority` to control ordering between renderers.
- Atlas loading applies its filter and wrap settings to the underlying Engine texture. Do not share that texture with a consumer that requires incompatible sampling state.

## Editor integration

- Editor migration is separate from the Engine 2.0 runtime change. Re-export legacy PMA images as straight alpha with color bleed and sRGB sampling, update atlas metadata, and remove serialized component PMA settings. The new integration loads `SpineResource` through the registered loader instead of constructing old backend types. Upgrading the engine alone does not migrate old assets.
