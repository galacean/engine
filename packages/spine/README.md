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

Use `SpineResource` and `SpineAnimationRenderer` to access skeletons, bones, skins and animation playback. These objects are shared across supported asset versions. Load resources through the resource manager; `renderer.skeleton` and `renderer.state` require a bound resource.

Use `resource.createSkin(name)` to compose skins from the same resource. Skeleton data, skins and mixing configuration are shared across instances. Each instance has its own pose and playback state.

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

Matching renderers share cached materials. Live renderer references protect them; unused variants participate in `ResourceManager.gc()`. Material destruction evicts its own cache entry. Destroying one renderer does not evict or destroy a material still used by another.

## Backend integration

The shared package registers the Spine loader. Version packages export their runtime adapter classes for explicit registration; native Spine classes are not re-exported from their package roots. Backend authors implement the contracts in `@galacean/engine-design`. Backends calculate world vertices and perform native clipping, then submit attachment geometry through `ISpineGeometry`. The shared layer owns the final vertex layout, index offsets, bounds and ordered draw batches, along with GPU buffers and materials. Input arrays and output buffers are reused.

For script/UMD builds, load the engine, shared Spine bundle and required version bundles, then register before loading assets:

```js
Galacean.Spine.registerSpineRuntime(new Galacean.SpineCore38.Spine38Runtime());
Galacean.Spine.registerSpineRuntime(new Galacean.SpineCore42.Spine42Runtime());
```
