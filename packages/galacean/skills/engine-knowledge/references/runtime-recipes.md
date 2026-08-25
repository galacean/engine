# Runtime Recipes

Use a recipe only when the task needs the same multi-API closure. These recipes are not an API catalog: resolve exact current signatures from the installed declarations, and read any linked semantic reference before adapting one.

## Physics-backed screen picking

Built-in 3D pointer callbacks and manual screen raycasts share the same physical target: an eligible collider shape in a physics-enabled Scene. A visible mesh alone is not pickable, and the supplied shape must match its visual target. See [coordinates-and-space.md](coordinates-and-space.md), [physics-setup.md](physics-setup.md), and [primitive-geometry.md](primitive-geometry.md).

```ts
import {
  Camera,
  ColliderShape,
  Entity,
  HitResult,
  PointerEventData,
  Ray,
  Scene,
  Script,
  StaticCollider,
  Vector2
} from "@galacean/engine";

class Pickable extends Script {
  onPointerDown(event: PointerEventData): void {
    console.log(this.entity.name, event.worldPosition);
  }
}

export function enable3DPicking(entity: Entity, shape: ColliderShape): void {
  const collider = entity.addComponent(StaticCollider);
  collider.addShape(shape);
  entity.addComponent(Pickable);
}

export function pickFromScreen(camera: Camera, scene: Scene, point: Vector2, outHit: HitResult): boolean {
  const ray = camera.screenPointToRay(point, new Ray());
  return scene.physics.raycast(ray, camera.farClipPlane, camera.cullingMask, outHit);
}
```

## Shadow-ready main light

Shadows require all owners in the chain: the Scene enables shadow rendering, its main light selects a non-`None` shadow mode, and each Renderer opts into casting or receiving.

```ts
import { DirectLight, Entity, Renderer, Scene, ShadowType } from "@galacean/engine";

export function enableMainLightShadows(scene: Scene, sunEntity: Entity, renderer: Renderer): DirectLight {
  const sun = sunEntity.addComponent(DirectLight);
  sun.shadowType = ShadowType.SoftHigh;
  scene.sun = sun;
  scene.castShadows = true;
  renderer.castShadows = true;
  renderer.receiveShadows = true;
  return sun;
}
```

## Drawable skybox

Selecting sky background mode is not sufficient. The Scene background also needs both a sky material and a mesh; the material needs a `TextureCube`, not a single 2D panorama.

```ts
import { BackgroundMode, Engine, PrimitiveMesh, Scene, SkyBoxMaterial, TextureCube } from "@galacean/engine";

export function configureSkybox(engine: Engine, scene: Scene, texture: TextureCube): void {
  const material = new SkyBoxMaterial(engine);
  material.texture = texture;

  scene.background.sky.material = material;
  scene.background.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
  scene.background.mode = BackgroundMode.Sky;
}
```

## Linear normal map on one renderer

Normal maps contain linear data. When only one Renderer should change, request its instance material and mutate the returned clone in place; do not assign it again. See [rendering-and-color.md](rendering-and-color.md).

```ts
import { AssetType, Engine, MeshRenderer, PBRMaterial, Texture2D } from "@galacean/engine";

export async function assignNormalMap(engine: Engine, renderer: MeshRenderer, url: string): Promise<boolean> {
  const material = renderer.getInstanceMaterial(0);
  if (!(material instanceof PBRMaterial)) {
    return false;
  }

  material.normalTexture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.Texture,
    url,
    params: { isSRGBColorSpace: false }
  });
  return true;
}
```

## Draw-ready custom mesh

Vertex data alone is not drawable. Close the chain with correct bounds, an index range, a SubMesh, a Renderer, and the matching material slot. See [rendering-and-color.md](rendering-and-color.md).

```ts
import { Engine, Entity, MeshRenderer, ModelMesh, UnlitMaterial, Vector3 } from "@galacean/engine";

export function createTriangle(engine: Engine, entity: Entity): void {
  const mesh = new ModelMesh(engine);
  mesh.setPositions([new Vector3(-0.5, -0.5, 0), new Vector3(0.5, -0.5, 0), new Vector3(0, 0.5, 0)]);
  mesh.setIndices(new Uint16Array([0, 1, 2]));
  mesh.bounds.min.set(-0.5, -0.5, -0.001);
  mesh.bounds.max.set(0.5, 0.5, 0.001);
  mesh.uploadData(true);
  mesh.addSubMesh(0, 3);

  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(new UnlitMaterial(engine));
}
```

## Collider-bounded local bloom

A local PostProcess takes its influence volume from collider shapes on the same Entity. It requires a physics-enabled Scene, an enabled Camera post-process path, and an actual effect; without any one of them, the volume has no observable result. See [physics-setup.md](physics-setup.md).

```ts
import { BloomEffect, Camera, ColliderShape, Entity, PostProcess, StaticCollider } from "@galacean/engine";

export function createLocalBloom(
  camera: Camera,
  entity: Entity,
  shape: ColliderShape,
  blendDistance: number
): PostProcess {
  camera.enablePostProcess = true;

  const volume = entity.addComponent(PostProcess);
  volume.addEffect(BloomEffect).intensity.value = 1;
  volume.isGlobal = false;
  volume.blendDistance = blendDistance;

  const collider = entity.addComponent(StaticCollider);
  collider.addShape(shape);
  return volume;
}
```
