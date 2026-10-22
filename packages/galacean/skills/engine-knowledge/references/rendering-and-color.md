# Rendering and Color Ownership

Use this reference when material sharing, camera composition, masking, or color-space intent affects the rendered result. For custom mesh draw requirements, see [mesh-geometry.md](mesh-geometry.md).

## Material state

- A renderer's assigned material is a shared resource. Mutating it affects every renderer that refers to that same material instance.
- Requesting an instance material clones the assigned material for that renderer. Use this only when per-renderer mutation is intentional; otherwise retain the shared material and avoid the extra resource.
- A missing material slot has no instance to clone. Treat material lookup as nullable rather than assuming slot zero exists.
- Shader property names and macros are shader contracts, not universal Engine names. Resolve them from the selected shader or material implementation.

## Draw ordering

- Entity hierarchy and sibling order do not own 3D draw order. Material render queue and `Renderer.priority` establish the primary order; equal-priority opaque draws may be regrouped for batching, while transparent draws are distance-sorted back to front.
- `Camera.priority` orders Cameras independently. A higher-priority Camera renders later than a lower-priority Camera.

## Camera composition and masking

- A later Camera preserves an earlier Camera's color only when its clear flags do not clear color. Use disjoint culling masks when world and overlay Cameras own different content; priority alone does not prevent duplicate rendering.
- Sprite masking closes three boundaries: `SpriteMask.influenceLayers`, each target renderer's mask layer and interaction, and a stencil-capable render target. The default depth-only format of a custom RenderTarget has no stencil, so the mask has no effect there.

## Color-space intent

- Lighting and material computation use linear values.
- Choose conversion by data meaning, not filename. Color textures normally represent sRGB content and should be decoded for linear computation. Data textures such as normals, masks, and packed material channels remain linear.
- Render-target color-space flags describe the stored data and conversion behavior. They must match the pass that writes and later samples the target.
- Screen output performs the final conversion required for display. Avoid manually applying another conversion unless a custom pass explicitly owns that transform.

## Shadow participation

Shadow rendering requires the Scene shadow switch, its selected sun light's
non-`None` shadow mode, and the participating Renderers' cast/receive settings.

## Sky background requirements

Sky background mode needs both a sky material and a mesh. `SkyBoxMaterial`
samples a `TextureCube`, not a single `Texture2D` panorama. Switching the sky's
material follows the material-sharing rules above.

## Linear normal map on one renderer

For a normal map selected at runtime, load linear data and request an instance
material when only one Renderer should change. Mutate the returned clone in
place; it is already assigned to the Renderer.

Attach this Script to an Entity with an authored `MeshRenderer` and PBR material.
Call `setNormalMap(url)` when gameplay selects a texture. After loading, confirm
that the Script, Renderer and assigned material are still valid before writing.

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

## Local post-processing requirements

A local PostProcess takes its influence volume from enabled collider shapes on
the same Entity. The Camera and volume must share a physics-enabled Scene, the
Camera's post-process path must be enabled, and the volume must contain an actual
effect. A visual box alone does not establish a volume.

Post-processing consumes the Collider's shapes; preserve their intended physical
behavior. See [physics-setup.md](physics-setup.md).
