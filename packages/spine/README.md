# Spine integration

Application code uses `SpineResource` and `SpineAnimationRenderer` from `@galacean/engine-spine`. Include the backend packages needed by the application's exported assets at its entry point:

```ts
import "@galacean/engine-spine-core-3.8";
import "@galacean/engine-spine-core-4.2";
import { SpineResource, SpineAnimationRenderer } from "@galacean/engine-spine";

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

The loader reads the JSON or binary export header before parsing the skeleton. Its major/minor version selects a registered backend. Resources, instances and clones keep this backend for their entire lifetime. Missing versions fail explicitly; importing a second backend never changes existing instances. Duplicate registrations for the same version are rejected.

An application using only 3.8 needs only the 3.8 backend. Neither the shared package nor the 3.8 backend depends on the 4.2 runtime. Import each required backend before loading its assets.

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

Entities instantiated from a resource keep it alive. The resource retains textures referenced by all skins, attachments and sequence frames, including those not currently drawn. Destroying the resource releases its internal entity template and rendering resources.

Matching renderers share cached materials. Live renderer references protect them; unused variants participate in `ResourceManager.gc()`. Material destruction evicts its own cache entry. Destroying one renderer does not evict or destroy a material still used by another.
