# Spine Runtime Semantics

Use this reference when runtime version, instance ownership, lifecycle timing, coordinate space, or rendering behavior affects a Spine integration. Resolve exact symbols from the installed `@galacean/engine-spine` declarations and use Spine data exported for that package's supported runtime version.

## Runtime ownership

- The current `@galacean/engine-spine` package directly depends on and re-exports one `@esotericsoftware/spine-core` 4.2 runtime. It does not select or replace a backend through a global registry.
- Importing the package registers its Engine classes and Spine loaders. The loaders claim `.json`, `.bin`, and `.skel`; load unrelated JSON with an explicit JSON asset type rather than relying on extension inference.

## Resource and instance ownership

- Create runtime entities through the resource's instantiate operation. The resource owns shared skeleton data, animation-state data, and its discovered atlas textures; each instance receives a fresh skeleton and animation state.
- Tracks, listeners, poses, slots, and each slot's active attachment selection are instance state. Attachment objects stored by shared skins or skeleton data may be shared, so mutating one can affect sibling instances. Mix configuration reached through an instance state's shared data also belongs to the resource.
- An additional atlas loaded for runtime attachment replacement is not automatically retained by the original Spine resource. Keep that atlas alive through an explicit owner.

## Activation and animation

- Default configuration is consumed when the renderer becomes enabled, not whenever a field changes. Set it before activation. Re-enabling reapplies the configured non-default skin and setup pose and restarts the configured track-zero animation.
- After directly changing a skin, restore slots to setup pose before expecting the new setup attachments to appear.
- Spine advances in the Renderer update phase after Script `onLateUpdate`: update state, apply it to the skeleton, update world transforms, then rebuild geometry and bounds. Animation-controlled bone values can therefore overwrite earlier Script edits in the same frame.
- An enabled renderer rebuilds its dynamic geometry each render update even when animation time is paused. Pausing time alone does not remove that geometry cost.

## Space and rendering

- The built-in loader scales skeleton data by `0.01`. Spine X and Y become renderer-local X and Y; local Z is synthesized from slot draw order, then the Entity world transform is applied. Convert world-space targets to renderer-local space before assigning bone or IK coordinates.
- Premultiplied-alpha mode must match the exported textures. Enable tint-black only for data exported with two-color tint.
- Clipping performs CPU triangle clipping during geometry rebuild. A texture or blend-mode transition in slot order starts another draw segment, so atlas-page count and slot interleaving affect draw calls.
- Atlas loading applies its filter and wrap settings to the underlying Engine texture. Do not share that texture with a consumer that requires incompatible sampling state.
