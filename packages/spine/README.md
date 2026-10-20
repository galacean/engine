# Spine integration

Application code uses `SpineResource` and `SpineAnimationRenderer` from `@galacean/engine-spine`. Register the backends needed by the application's exported assets at its entry point, before loading Spine resources:

```ts
import { Spine38Runtime } from "@galacean/engine-spine-core-3.8";
import { Spine42Runtime } from "@galacean/engine-spine-core-4.2";
import { registerSpineRuntime, SpineResource, SpineAnimationRenderer } from "@galacean/engine-spine";

registerSpineRuntime(new Spine38Runtime());
registerSpineRuntime(new Spine42Runtime());

const resource = await engine.resourceManager.load<SpineResource>({
  url: "character.json",
  type: "Spine"
});
const character = resource.instantiate();
root.addChild(character);
const renderer = character.getComponent(SpineAnimationRenderer);
renderer.state.setAnimation(0, "idle", true);
renderer.skeleton.setSkinByName("winter");
renderer.skeleton.setSlotsToSetupPose();
```

The loader reads the JSON or binary export header before parsing the skeleton. Its major/minor version selects a registered backend once, and the resource retains that backend alongside the parsed data. Instances and clones use the resource's backend to create independent skeleton poses and animation states. Assigning another resource to a renderer recreates these states with the new resource's backend.

The registry is shared by consumers of the same `engine-spine` module, rather than configured per Engine. Importing a backend package does not register it. Missing versions fail explicitly; registering another version never changes existing resources. Registering the same instance again is allowed, but a different instance for an already registered version is rejected.

An application using only 3.8 installs and registers only the 3.8 backend. Neither the shared package nor the 3.8 backend depends on the 4.2 runtime. The loader does not download missing backends.

## Public API

Use `SpineResource` and `SpineAnimationRenderer` to access skeletons, bones, slots, skins and animation playback. These objects are shared across supported asset versions. Load resources through the resource manager; `renderer.skeleton` and `renderer.state` require a bound resource.

`skeleton.findSlot(name)` returns a `SpineSlot`, or `null` if the name is missing. The same slot object is reused across lookups, animation updates and skin changes. `skeleton.slots` lists slots in setup order; `slot.bone` is the corresponding object from `skeleton.bones`. Slots belong to each skeleton instance.

```ts
const weapon = renderer.skeleton.findSlot("weapon");
if (weapon) {
  weapon.setAttachment("sword"); // Attachment entry in the current skin, falling back to the default skin.
  weapon.setAttachment(null); // Hide this slot's attachment.
  weapon.setToSetupPose(); // Restore its setup color and attachment using the current skin.
}
```

Use `resource.createSkin(name)` to compose skins from the same resource. Skeleton data, skins and mixing configuration are shared across instances. Each instance has its own pose and playback state.

## Playback and time

The renderer updates automatically. Keep Spine's track and queue APIs to arrange animations:

```ts
resource.stateData.defaultMix = 0.2; // Shared mixing configuration.
const state = renderer.state;
state.setAnimation(0, "attack", false);
state.addAnimation(0, "idle", true, 0);
```

`renderer.timeScale` defaults to 1 and scales both animation and skeleton time, including 4.2 physics. Zero stops time advancement but continues applying the pose and drawing, so skin changes and explicit track-time edits still appear. Restore the previous multiplier to resume:

```ts
renderer.timeScale = 0.5;
const previousTimeScale = renderer.timeScale;
renderer.timeScale = 0;
renderer.timeScale = previousTimeScale;
```

The native `state.timeScale` and `entry.timeScale` remain independent animation controls. Relative to the engine's delta time, a track advances by `renderer.timeScale * state.timeScale * entry.timeScale`; mixing advances by `renderer.timeScale * state.timeScale`, and skeleton physics by `renderer.timeScale`. Changing an entry's `trackTime` selects an animation time on the next update; it does not seek physics history.

## Materials

Renderers in the same engine initially share one default `SpineMaterial`. Set or instance this material using the standard renderer API. It is used by slots without a material override and remains assigned through animation updates, skin changes and resource rebinding. Dynamic batch indices are not material slots.

```ts
import { SpineMaterial } from "@galacean/engine-spine";

const material = new SpineMaterial(engine, customShader);
renderer.setMaterial(material);
// Or get an independent copy of the current material:
const instance = renderer.getInstanceMaterial();
```

Use a `SpineSlot` to override the material for part of a character:

```ts
const weapon = renderer.skeleton.findSlot("weapon");
if (weapon) {
  renderer.setMaterial(weapon, weaponMaterial);
  renderer.getMaterial(weapon); // Effective material: the override, or the renderer's default.
  renderer.setMaterial(weapon, null); // Remove the override.
}
```

`setMaterial(material)` and `setMaterial(0, material)` set the default material. Numeric indices retain their renderer material-array meaning; they do not identify Spine slots. `getMaterials()` and `getInstanceMaterial()` retain their inherited material-array behavior. Slot overrides are independent of this array. With a null default material, only slots with an override render.

Overrides survive skin, attachment and draw-order changes. Clones retain the material references and apply them to their own slots. Changing or clearing the resource removes the overrides; a slot from another instance or an old resource binding is rejected. Adjacent attachments batch together only when their effective material, texture and blend mode match.

A custom shader consumes the Spine vertex layout (`POSITION`, `LIGHT_COLOR`, `TEXCOORD_0`, and `DARK_COLOR` when enabled) and these inputs:

| Scope | Input |
| --- | --- |
| Renderer macro | `RENDERER_TINT_BLACK` |
| Renderer float | `renderer_PremultipliedAlpha` |
| Batch texture | `renderElement_SpineTexture` |
| Batch blend factors | `renderElement_SpineSourceColorBlendFactor`, `renderElement_SpineDestinationColorBlendFactor`, `renderElement_SpineSourceAlphaBlendFactor`, `renderElement_SpineDestinationAlphaBlendFactor` |

The built-in `2D/Spine` pass binds its blend state to the batch factors. Custom passes can bind these same variables to preserve Spine's blend modes, or declare their own fixed state. Spine does not overwrite a pass's state. User parameters remain on the original material; no hidden material copies need synchronizing. Renderer macros and batch textures do not mutate shared materials.

## Physics

Physics is an explicit capability, including on backends that do not support it:

```ts
const physics = renderer.physics; // null before an asset is bound
if (physics?.supported) {
  physics.value.physicsTranslate(1, 0);
  for (const constraint of physics.value.physicsConstraints) constraint.reset();
} else if (physics) {
  console.log(physics.reason); // e.g. Spine 3.8 does not support physics constraints
}
```

A supported capability with an empty constraint list is different from an unsupported capability. Physics constraints belong to the skeleton and are evaluated by its backend, together with the other constraints. They are not an independent physics world.

## Resource lifetime

Use `state.addAnimation` for a known playback sequence, and `entry.listener` for callbacks belonging to one playback. Playback commands finish configuring and wrapping their entries before dispatching callbacks; callbacks remain synchronous and are not deferred to another frame. The returned entry and callback arguments have the same identity.

Completion callbacks can replace or enqueue animations, or destroy the effect entity. Disposal notifications run while their entries are still readable, then those entries become invalid. Internal listener cleanup waits for the active command or animation update to finish dispatching. A renderer whose resource binding ended during a callback does not submit the old binding's geometry.

Entities instantiated from a resource keep it alive. The resource retains textures referenced by all skins, attachments and sequence frames, including those not currently drawn. Destroying the resource releases its internal entity template and rendering resources.

Live renderer references protect shared or user-assigned materials. Unreferenced materials participate in `ResourceManager.gc()`. Destroying one renderer does not destroy a material still used by another.

## Backend integration

The shared package registers the Spine loader. Version packages export their runtime adapter classes for explicit registration; native Spine classes are not re-exported from their package roots. Backend authors implement the contracts in `@galacean/engine-design`. Backends calculate world vertices and perform native clipping, then submit attachment geometry through `ISpineGeometry`. The shared layer owns the final vertex layout, index offsets, bounds and ordered draw batches, along with GPU buffers and materials. Input arrays and output buffers are reused.

For script/UMD builds, load the engine, shared Spine bundle and required version bundles, then register before loading assets:

```js
Galacean.Spine.registerSpineRuntime(new Galacean.SpineCore38.Spine38Runtime());
Galacean.Spine.registerSpineRuntime(new Galacean.SpineCore42.Spine42Runtime());
```
