# Spine integration

Application code uses `SpineResource` and `SpineAnimationRenderer` from `@galacean/engine-spine`. Install the backend matching your assets and pass one runtime instance when creating the engine. Import `engine-spine` before engine creation so its loader receives the configuration:

```ts
import { WebGLEngine } from "@galacean/engine";
import { Spine38Runtime } from "@galacean/engine-spine-core-3.8";
import { SpineResource, SpineAnimationRenderer } from "@galacean/engine-spine";

const engine = await WebGLEngine.create({
  canvas: "canvas",
  spine: new Spine38Runtime()
});
const resource = await engine.resourceManager.load<SpineResource>({
  url: "character.json",
  type: "Spine"
});
const character = resource.instantiate();
engine.sceneManager.activeScene.addRootEntity(character);
const renderer = character.getComponent(SpineAnimationRenderer);
renderer.state.setAnimation(0, "idle", true);
renderer.skeleton.setSkinByName("winter");
renderer.skeleton.setSlotsToSetupPose();
```

The loader reads the JSON or binary export header before parsing the skeleton. Its major/minor version selects a backend registered for that engine, and the resource retains that backend alongside the parsed data. Instances and clones use the resource's backend to create independent skeleton poses and animation states. Assigning another resource to a renderer recreates these states with the resource's backend.

Editors and applications that need another version later can register it on the same engine:

```ts
import { registerSpineRuntime } from "@galacean/engine-spine";
import { Spine42Runtime } from "@galacean/engine-spine-core-4.2";

registerSpineRuntime(engine, new Spine42Runtime());
```

Registration adds a version; it does not replace the previously configured backend or reinitialize existing resources. Loaded 3.8 resources keep their backend and playback state, while 4.2 assets can now load on the same engine. Cached resources keep their identity. Registrations are isolated per engine, so configuring one engine does not configure another. Registering the same instance again is allowed; a different instance for an already registered version is rejected. Editors should retain and reuse runtime instances when revisiting a version.

An application using only 3.8 installs and configures only the 3.8 backend. Neither the shared package nor the 3.8 backend depends on the 4.2 runtime. Importing a backend alone does not register it. Missing versions fail explicitly; the loader does not download missing backends or fall back to another version.

Only `.skel` selects the Spine loader automatically; `.json` and `.bin` require `type: "Spine"`. Skeleton content may be JSON or Spine binary data regardless of extension. For a single URL, explicit atlas dependencies take precedence; otherwise the loader derives a sibling `.atlas` path without inheriting the skeleton URL's query or fragment. Use `urls` to supply an atlas URL with its own query parameters. Textures resolve from atlas page names unless explicit URLs or asset dependencies provide them.

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

## Pose update signals

Use renderer signals to modify or read the current frame's pose at a defined stage:

| Signal | Timing and purpose |
| --- | --- |
| `onBeforeApply` | After time advances, before animation application; prepare the base pose. |
| `onUpdateLocal` | After animation application, before constraints and world transforms; edit local bone values. |
| `onUpdateWorld` | After a preliminary pose solve; read world values to adjust local values before the final solve. |
| `onUpdateComplete` | After the final solve, before geometry generation; read the final bone transforms. |

```ts
const aim = (source: SpineAnimationRenderer) => {
  const head = source.skeleton.findBone("head");
  if (head) head.rotation += 15;
};
renderer.onUpdateLocal.on(aim);
// Remove when the behavior is no longer needed:
renderer.onUpdateLocal.off(aim);
```

Signals run synchronously in this order, including when `renderer.timeScale` is zero. `onUpdateWorld` adds a preliminary solve only while it has listeners; 4.2 uses the existing physics pose for this solve and advances simulation only in the final solve. Bone world values are in skeleton space; apply the entity's world transform when positioning scene objects. Changing local bone values in `onUpdateComplete` does not trigger another solve.

Pose updates still run in the renderer update phase, after scripts' `onLateUpdate`. Signals belong to the renderer and survive resource changes; read its current skeleton in callbacks. Destroying the renderer removes the listeners. Cloning follows `Signal` rules: component/method bindings are remapped, while function listeners are not copied.

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
| Batch texture | `renderElement_SpineTexture` |
| Batch blend factors | `renderElement_SpineSourceColorBlendFactor`, `renderElement_SpineDestinationColorBlendFactor`, `renderElement_SpineSourceAlphaBlendFactor`, `renderElement_SpineDestinationAlphaBlendFactor` |

Textures and vertex colors use straight alpha. Vertex colors are sRGB values; decode them to linear space before tinting. Sample the atlas with `texture2DSRGB`. Premultiply the final linear RGB by the final alpha before output when using the supplied batch blend factors. The built-in shader follows this contract for normal, additive, multiply and screen blending.

The built-in `2D/Spine` pass binds its blend state to the batch factors. Custom passes can bind these same variables to preserve Spine's blend modes, or declare their own fixed state. Spine does not overwrite a pass's state. User parameters remain on the original material; no hidden material copies need synchronizing. Renderer macros and batch textures do not mutate shared materials.

## Atlas textures

Spine uses the engine's linear rendering workflow and requires **straight-alpha sRGB textures**. In Spine's Texture Packer settings, disable **Premultiply alpha** and enable **Bleed**. Bleed fills transparent pixels with neighboring colors without changing alpha, reducing dark edges during texture filtering. The shader still premultiplies its final linear output for blending; input textures must not be premultiplied.

The loader rejects any atlas page marked `pma: true`, with the page name and export instructions. Older atlases without `pma` are assumed to contain straight-alpha textures; the loader cannot infer encoding from pixels. Re-export legacy PMA images rather than just changing the flag. There is no alpha-mode override or renderer PMA switch.

Ordinary images use the texture loader's default `isSRGBColorSpace: true`. For `.tex` and compressed textures, enable sRGB in the exported texture. A texture already loaded without sRGB sampling is rejected instead of modifying a shared resource. Configure textures before their first load: ResourceManager caches by URL. Generate compression and mipmaps from the straight-alpha image with color bleed.

Textures use the existing loading, sharing and content restoration path. Spine does not read back pixels or create conversion textures.

### Editor migration

The editor upgrade is separate from this engine change. Re-export existing PMA assets as straight alpha with color bleed, enable sRGB on their textures, and emit `pma: false` (or omit `pma`). Remove the serialized component-level `premultipliedAlpha` field. For legacy assets without metadata, check their original export settings; deleting the old component flag does not convert their pixels.

Load the skeleton and atlas dependencies through the registered Spine loader to obtain a `SpineResource`. The editor should stop constructing the old library's `SkeletonData`, `TextureAtlas` and `SpineResource` directly. Applications and custom shaders should remove the old renderer PMA property/uniform and follow the material contract above.

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

The shared package registers the Spine loader. Version packages export their runtime adapter classes for engine configuration and explicit registration; native Spine classes are not re-exported from their package roots. Backend authors implement the contracts in `@galacean/engine-design`. Backends calculate world vertices and perform native clipping, then submit attachment geometry through `ISpineGeometry`. The shared layer owns the final vertex layout, index offsets, bounds and ordered draw batches, along with GPU buffers and materials. Input arrays and output buffers are reused.

The 3.8 backend vendors runtime sources because the official `@esotericsoftware/spine-core` npm package has no 3.8 release. The 4.2 backend consumes the official npm package. Both backend builds bundle their native runtime code; this source-distribution difference does not change the public API or registration model.

For script/UMD builds, load the engine, shared Spine bundle and required version bundles before creating the engine:

```js
const engine = await Galacean.WebGLEngine.create({
  canvas: "canvas",
  spine: new Galacean.SpineCore38.Spine38Runtime()
});
// Add another version when needed:
Galacean.Spine.registerSpineRuntime(engine, new Galacean.SpineCore42.Spine42Runtime());
```
