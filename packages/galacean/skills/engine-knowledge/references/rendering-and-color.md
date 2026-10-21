# Rendering and Color Ownership

Use this reference when material sharing, camera composition, masking, or color-space intent affects the rendered result.

## Material state

- A renderer's assigned material is a shared resource. Mutating it affects every renderer that refers to that same material instance.
- Requesting an instance material clones the assigned material for that renderer. Use this only when per-renderer mutation is intentional; otherwise retain the shared material and avoid the extra resource.
- A missing material slot has no instance to clone. Treat material lookup as nullable rather than assuming slot zero exists.
- Shader property names and macros are shader contracts, not universal Engine names. Resolve them from the selected shader or material implementation.
- Uploading custom vertex or index data does not by itself make a Mesh drawable. A `MeshRenderer` needs at least one SubMesh and a material in the corresponding slot before it can emit a render element.

## Draw ordering

- Entity hierarchy and sibling order do not own 3D draw order. Material render queue and `Renderer.priority` establish the primary order; equal-priority opaque draws may be regrouped for batching, while transparent draws are distance-sorted back to front.
- `Camera.priority` orders Cameras independently. A higher-priority Camera renders later than a lower-priority Camera.

## Camera composition and masking

- A later Camera preserves an earlier Camera's color only when its clear flags do not clear color. Use disjoint culling masks when world and overlay Cameras own different content; priority alone does not prevent duplicate rendering.
- Sprite masking closes three boundaries: `SpriteMask.influenceLayers`, each target renderer's mask layer and interaction, and a stencil-capable render target. The default depth-only format of a custom RenderTarget has no stencil, so the mask has no effect there.

## Color-space intent

- Lighting and material computation use linear values.
- Color textures normally represent sRGB content and should be decoded for linear computation. Data textures such as normals, masks, and packed material channels remain linear.
- Render-target color-space flags describe the stored data and conversion behavior. They must match the pass that writes and later samples the target.
- Screen output performs the final conversion required for display. Avoid manually applying another conversion unless a custom pass explicitly owns that transform.

## Decision rule

Classify every texture by data meaning, not filename. Keep one material owner unless independent mutation is required, make camera and mask buffer ownership explicit, and keep color conversion at the boundary that changes representation.

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

Normal maps contain linear data. When only one Renderer should change, request its instance material and mutate the returned clone in place; do not assign it again.

```ts
import { AssetType, Engine, MeshRenderer, PBRMaterial, Texture2D } from "@galacean/engine";

export async function assignNormalMap(engine: Engine, renderer: MeshRenderer, url: string): Promise<boolean> {
  const assignedMaterial = renderer.getMaterial(0);
  if (!(assignedMaterial instanceof PBRMaterial)) {
    return false;
  }

  const texture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.Texture,
    url,
    params: { isSRGBColorSpace: false }
  });

  if (renderer.getMaterial(0) !== assignedMaterial) {
    return false;
  }

  const material = renderer.getInstanceMaterial(0);
  if (!(material instanceof PBRMaterial)) {
    return false;
  }

  material.normalTexture = texture;
  return true;
}
```

## Collider-bounded local bloom

A local PostProcess takes its influence volume from enabled collider shapes on the same Entity. The caller owns those colliders and their physical behavior; this recipe consumes but never creates or reconfigures that volume. It also requires the Camera and volume to share a physics-enabled Scene, an enabled Camera post-process path, and an actual effect. See [physics-setup.md](physics-setup.md).

```ts
import { BloomEffect, Camera, Collider, Entity, PostProcess } from "@galacean/engine";

export function createLocalBloom(camera: Camera, entity: Entity, blendDistance: number): PostProcess {
  if (!entity.scene || camera.scene !== entity.scene) {
    throw new Error("Local post-process requires the Camera and volume Entity to share a Scene");
  }

  const colliders: Collider[] = [];
  entity.getComponents(Collider, colliders);
  if (!colliders.some((collider) => collider.enabled && collider.shapes.length > 0)) {
    throw new Error("Local post-process requires an enabled collider shape owned by the same Entity");
  }

  if (entity.getComponent(PostProcess)) {
    throw new Error("The volume Entity already owns a PostProcess");
  }

  const volume = entity.addComponent(PostProcess);
  volume.isGlobal = false;
  if (volume.isGlobal) {
    volume.destroy();
    throw new Error("Local post-process requires a physics-enabled Scene");
  }

  volume.blendDistance = blendDistance;
  const bloom = volume.addEffect(BloomEffect);
  if (bloom) bloom.intensity.value = 1;
  camera.enablePostProcess = true;

  return volume;
}
```
