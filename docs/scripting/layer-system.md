# Layer System

Galacean exposes 32 bitmask layers for selectively rendering, lighting, and colliding entities. Layers are powers of two defined in `Layer.ts` and can be combined through bitwise operators. Cameras and lights accept masks (multiple layers), while entities and colliders belong to a single layer at a time.

## Quick Reference

```ts
import {
  Camera,
  CameraClearFlags,
  DirectLight,
  Entity,
  Layer,
  WebGLEngine
} from '@galacean/engine';

const engine = await WebGLEngine.create({ canvas });
const scene = engine.sceneManager.activeScene;

// Entities default to Layer.Layer0
const player = scene.createRootEntity('Player');
const enemies = scene.createRootEntity('Enemies');
const uiRoot = scene.createRootEntity('UI');

enemies.layer = Layer.Layer1;
uiRoot.layer = Layer.Layer2;

const cameraEntity = scene.createRootEntity('MainCamera');
const camera = cameraEntity.addComponent(Camera);

// Render gameplay but skip UI
camera.cullingMask = Layer.Layer0 | Layer.Layer1;

// Secondary camera renders UI only
const uiCamera = scene.createRootEntity('UICamera').addComponent(Camera);
uiCamera.cullingMask = Layer.Layer2;
uiCamera.clearFlags = CameraClearFlags.Depth;
uiCamera.isOrthographic = true;
```

`Layer.Everything` represents all bits set; `Layer.Nothing` is zero.

## Layer Enum

The enum defines 32 single-bit values:

- `Layer.Layer0` … `Layer.Layer31`
- `Layer.Everything` (0xffffffff)
- `Layer.Nothing` (0x0)

Combine masks with `|`, exclude using `& ~layer`, test membership with `(mask & layer) !== 0`.

## Entity Layers vs Masks

Entities store one layer:

```ts
entity.layer = Layer.Layer5;
```

Cameras, lights, physics queries, and other mask consumers accept any combination of bits:

```ts
camera.cullingMask = Layer.Layer0 | Layer.Layer4;
directLight.cullingMask = Layer.Layer0 | Layer.Layer1;
```

Because entities are single-layer, you can use bitwise operations on masks without worrying about ambiguous overlaps.

## Rendering and Lighting

### Camera culling

- `Camera.cullingMask` controls which layers render.
- `Camera.postProcessMask` gates which cameras feed post-processing.
- UI setups typically use two stacked cameras: one for 3D content, one for `Layer.Layer2` (or similar).

### Light culling

All light types expose `cullingMask`. The internal `LightManager` splits the 32-bit mask into two 16-bit integers, so large masks are supported.

```ts
const lamp = scene.createRootEntity('Lamp').addComponent(DirectLight);
lamp.cullingMask = Layer.Layer0 | Layer.Layer3; // illuminate gameplay + props
```

### Probe capture

`Probe.probeLayer` works exactly like a camera mask. Keep UI or debugging layers out by masking them off.

## Physics Collision Layers

Colliders also have a single layer. Assigning a combined mask throws because the engine verifies the value is a pure power-of-two.

```ts
const collider = entity.addComponent(DynamicCollider);
collider.collisionLayer = Layer.Layer4; // one layer only
```

Control which layers interact through the `PhysicsScene` collision matrix. Internally, the physics backend stores a 32 × 32 boolean table.

```ts
const physics = scene.physics;

// Disable player <-> enemy collisions
physics.setColliderLayerCollision(Layer.Layer0, Layer.Layer1, false);

const canHit = physics.getColliderLayerCollision(Layer.Layer0, Layer.Layer1);
console.log('Player collides with enemies?', canHit);
```

All physics queries support an optional layer mask to filter results:

```ts
const ray = new Ray(origin, direction);
const hit = physics.raycast(ray, 100, Layer.Layer0 | Layer.Layer1, hitResult);
```

`raycast`, `boxCast`, `sphereCast`, etc. default to `Layer.Everything` when no mask is provided.

## Layer Utilities

```ts
function addLayer(mask: Layer, layer: Layer): Layer {
  return mask | layer;
}

function removeLayer(mask: Layer, layer: Layer): Layer {
  return mask & ~layer;
}

function hasLayer(mask: Layer, layer: Layer): boolean {
  return (mask & layer) !== 0;
}
```

Cache frequently used masks to avoid recomputing bit expressions every frame.

## Recommended Conventions

- Reserve low indices (`Layer0`, `Layer1`, `Layer2`) for core systems (world, enemies, UI). Document the mapping for your team.
- Dedicate a layer to editor/debug helpers so you can toggle them off globally.
- Leave a block of higher bits for temporary/spawned items—masks are cheap to tweak at runtime.
- When authoring assets in the editor, give prefabs meaningful default layers to reduce errors at import time.
- For physics: build a collision matrix chart early in production, update alongside code, and enforce rules in prefab validation.
- Always use bitwise operations, not addition or subtraction, when composing masks.

By keeping entity layers distinct and masks expressive, you can scale render, lighting, and physics selection logic without allocating additional marker components or tags.
