# Rendering and Color Ownership

Use this reference when material sharing, draw ordering, camera composition, masking, color-space intent, shadows, skybox, or local post-processing affects rendered output. For custom mesh draw requirements, see [mesh-geometry.md](mesh-geometry.md).

## Material state

- A Renderer's assigned material is a shared resource; mutating it affects every Renderer referencing that material instance.
- `renderer.getInstanceMaterial(index)` clones the assigned material for that Renderer. Use it only when per-renderer mutation is intentional; otherwise share the material to avoid extra resources.
- Treat material slot lookup as nullable rather than assuming slot `0` exists; an empty slot has no material to clone.
- Shader property names and macros are per-shader contracts; resolve them from the target shader or material declarations.

## Draw ordering

- Entity hierarchy and sibling order do not determine 3D draw order. Material render queue and `Renderer.priority` define primary order: equal-priority opaque draws may regroup for batching, while transparent draws distance-sort back to front.
- `Camera.priority` orders Cameras independently; higher-priority Cameras render later.

## Camera composition and SpriteMask

- A later Camera preserves an earlier Camera's color only when its `clearFlags` do not clear color. Use disjoint `cullingMask` values when world and overlay Cameras own separate content; priority alone does not prevent duplicate rendering.
- `SpriteMask` requires three matching boundaries: `SpriteMask.influenceLayers`, each target SpriteRenderer's `maskInteraction` and `maskLayer`, and a stencil-capable render target (the default depth-only format of a custom `RenderTarget` lacks stencil, so masks have no effect there).

## Color-space intent

- Lighting and material shaders compute in linear space.
- Choose texture color space by data meaning, not filename: color textures represent sRGB content (`isSRGBColorSpace: true`) decoded to linear on sample; data textures (normals, masks, packed channels) stay linear (`isSRGBColorSpace: false`).
- `RenderTarget` color-space flags describe the stored buffer and must match the pass writing and sampling it.
- Screen output applies final display encoding; avoid manual gamma/sRGB conversion unless a custom pass explicitly owns that transform.

## Shadow and skybox requirements

- **Shadows**: require the Scene shadow switch, the selected sun light's non-`None` shadow mode, and participating Renderers' cast/receive shadow flags.
- **Skybox**: sky background mode needs both a sky material and a mesh; `SkyBoxMaterial` samples a `TextureCube` (not a single `Texture2D` panorama) and follows the material-sharing rules above.

## Local post-processing volumes

A local `PostProcess` (`isGlobal = false`) applies only when all of these hold:

- The Camera and volume share a physics-enabled Scene, `camera.enablePostProcess` is enabled, and `(camera.postProcessMask & postProcess.layer)` overlaps.
- The `PostProcess` contains at least one enabled `PostProcessEffect`.
- The same Entity has at least one enabled `Collider` with collider shapes (a visual mesh alone does not define a volume); `blendDistance` fades influence from `1` inside the collider to `0` at `blendDistance` world units outside.

See [physics-setup.md](physics-setup.md) for collider setup.

## Linear normal map on one renderer

Load normal maps as linear data (`isSRGBColorSpace: false`), verify async completion against destruction and slot replacement, then clone via `getInstanceMaterial(0)` so only this Renderer changes:

```ts
import { AssetType, MeshRenderer, PBRMaterial, Script, Texture2D } from "@galacean/engine";

export class NormalMapController extends Script {
  async setNormalMap(url: string): Promise<boolean> {
    const renderer = this.entity.getComponent(MeshRenderer);
    const assignedMaterial = renderer?.getMaterial(0);
    if (!renderer || !(assignedMaterial instanceof PBRMaterial)) {
      return false;
    }

    const texture = await this.engine.resourceManager.load<Texture2D>({
      type: AssetType.Texture,
      url,
      params: { isSRGBColorSpace: false }
    });

    if (this.destroyed || renderer.destroyed || renderer.getMaterial(0) !== assignedMaterial) {
      return false;
    }

    const material = renderer.getInstanceMaterial(0);
    if (!(material instanceof PBRMaterial)) {
      return false;
    }

    material.normalTexture = texture;
    return true;
  }
}
```
