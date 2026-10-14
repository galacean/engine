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

An application using only 3.8 needs only the 3.8 backend. Neither the shared package nor the 3.8 backend depends on the 4.2 runtime. Automatic asset-graph-based selection belongs to the editor/build integration and is not implemented by this loader.

## Object contracts and capabilities

Backend contracts live in `packages/design/src/spine/`, with one `ISpineXXX` interface per file, following the physics interfaces. Backends import these contracts directly from `engine-design`; the Spine entry point does not re-export them.

The generic `ISpineRuntime<TTexture, TRenderTarget>` factory contract also lives in `engine-design`. Backends implement it with `Texture2D` and `ISpineRenderTarget`. The rendering target stays in the integration layer because it refers to engine buffers, materials and primitives. This keeps `engine-design` independent of the engine and native Spine runtimes. Runtime registration and rendering-target interfaces are backend extension points.

All three Spine packages declare `engine-design` as a published dependency because their backend integration declarations reference it. These imports are type-only and add no JavaScript to the application bundle.

Application-facing objects are owned by the Spine package: `SpineSkeleton`, `SpineBone`, `SpineSkin`, `SpineAnimationState`, `SpineTrackEntry`, shared data objects and physics controls. Their public declarations do not reference `engine-design`. `renderer.skeleton`, `renderer.state`, resource getters and callbacks return these public objects, with implementation handles hidden from published declarations. Load resources through the resource manager; their construction from backend handles is internal. Accessing `skeleton` or `state` before binding a resource throws explicitly.

The public API covers animation playback and mixing, skin composition/selection, named attachment selection, bone transforms and physics capabilities. It does not mirror every native slot, attachment or constraint API. Backend parsing, animation application and ordered constraint evaluation remain native, and renderer updates pass the original handles directly to the backend.

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

Use `resource.createSkin(name)` to compose skins without importing a version backend's classes. Cross-resource skin composition and assignment are rejected. Public skeleton data, animation metadata, skins and mixing configuration are shared across instances. Each instance owns its skeleton, bones, animation state, physics controls, vertex/index buffers and bounds. Public pose wrappers are created once per instance; repeated getters and rendering updates do not create more wrappers.

Playback callbacks receive public track entries with stable identity and immutable event snapshots. A native pooled entry gets a new public wrapper when reused. Once dispose callbacks finish, the old wrapper reports `disposed` and rejects access to playback properties, so it cannot mutate a later animation. Clearing user listeners preserves this internal disposal tracking.

Backend packages retain their native exports for applications that explicitly use native APIs. Those APIs are version-specific. The 4.2 backend declares its upstream type dependency and bundles its runtime JS together with the adapter so ES5 subclasses and their base classes remain compatible.

## Resource lifetime

Entities instantiated from a resource keep it alive. The resource retains textures referenced by all skins, attachments and sequence frames, including those not currently drawn. Destroying the resource also destroys its internal entity template and primitive.

Matching renderers share cached materials. Live renderer references protect them; unused variants participate in `ResourceManager.gc()`. Material destruction evicts its own cache entry. Destroying one renderer does not evict or destroy a material still used by another.

## Validation

After `npm run build`:

- `HEADLESS=true pnpm exec vitest run tests/src/spine --browser.headless`
- `npm run test:spine:packages`

The package check installs actual tarballs in clean temporary consumers for 3.8, 4.2 and both. It checks strict declarations and expected type errors, verifies unused backends are absent, and draws both versions in Chromium with ESM and CommonJS package entry points, in both import orders. It compares full TypeScript diagnostics against an engine-only consumer because other engine packages currently have independent declaration errors; it does not enable `skipLibCheck` or suppress new Spine diagnostics. Failed consumers are retained for inspection.
