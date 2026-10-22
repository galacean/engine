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

## Shadow participation

Shadow rendering requires the Scene shadow switch, its selected sun light's
non-`None` shadow mode, and the participating Renderers' cast/receive settings.
In a hosted project, author these defaults through the host API. Runtime changes
operate on those configured objects; creating another light does not configure
the existing one.

## Sky background requirements

Sky background mode needs both a sky material and a mesh. `SkyBoxMaterial`
samples a `TextureCube`, not a single `Texture2D` panorama. For a known background,
author the material, texture and Scene references through the host API. Runtime
code can switch between configured skies or create resources for a generated
environment; the material-sharing rules above still apply.

## Linear normal map on one renderer

Normal maps contain linear data. Author known texture bindings through the host
API. The example below is for a texture chosen during play. When only one
Renderer should change, request its instance material and mutate the returned
clone in place; do not assign it again.

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

## Local post-processing requirements

A local PostProcess takes its influence volume from enabled collider shapes on
the same Entity. The Camera and volume must share a physics-enabled Scene, the
Camera's post-process path must be enabled, and the volume must contain an actual
effect. A visual box alone does not establish a volume.

Author stable volumes, collider shapes and effect defaults through the host API.
Use runtime code for behavior-driven effect changes or runtime-only settings
that the host does not expose. Preserve the configured Collider's physical
behavior; a visual effect does not implicitly own it. See
[physics-setup.md](physics-setup.md).
