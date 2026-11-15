# Mesh Geometry

Use this reference when scripts generate, share, or update geometry at runtime. Read the installed factory and mesh declarations for exact inputs, units, UV mapping and material-slot order.

## Generate from runtime input

Reuse a configured mesh when its geometry already meets the task. Generate a mesh when its shape depends on runtime data, such as a path chosen during play. Keep that mesh while the geometry is unchanged; use Entity transforms for placement, rotation and per-instance scaling.

The following helper generates a tube from a runtime path and assigns it to an existing Renderer whose material is already configured. Call it when the path changes, and reuse the returned mesh if other Renderers should share it.

```ts
import { MeshRenderer, ModelMesh, PrimitiveMesh, Vector3 } from "@galacean/engine";

export function createRuntimeTube(renderer: MeshRenderer, path: readonly Vector3[], radius: number): ModelMesh {
  const mesh = PrimitiveMesh.createTube(renderer.engine, path, radius);
  renderer.mesh = mesh;
  return mesh;
}
```

## Share and replace geometry

Renderers assigned the same mesh share its geometry. Create an independent mesh when one object's geometry must change independently; Entity transforms can still differ between users of a shared mesh.

When rebuilding changes the sub-mesh layout, update the Renderer's material assignments to match. Retire replaced meshes according to their remaining users and [resource ownership](resource-ownership.md). Material sharing is covered in [rendering-and-color.md](rendering-and-color.md).

## Update existing vertex data

Choose readable data when the Script needs to read or edit vertex attributes later. For primitives, request `keepMeshData: true` at creation. After editing a returned attribute array, call its setter and upload the changes; use `uploadData(false)` while further CPU-side edits are needed.

If topology changes, keep indices and SubMesh draw ranges consistent with the vertex arrays.

Update bounds after position changes so culling matches the new geometry. Keep normals and tangents consistent with the deformed surface when the material uses them. Retaining readable data alone does not guarantee that runtime edits survive device loss; use the mesh's restoration contract to plan how its runtime state is regenerated.

## Place geometry and configure collision

Compare rendered bounds in a common space when aligning runtime pieces. Non-uniform Entity scale changes their rendered extents. Meshes and collider shapes have independent dimensions: assigning a mesh does not configure its collider. Set collision dimensions from the intended geometry, accounting for Entity scale. See [physics-setup.md](physics-setup.md) for collision and picking.

## Supply custom vertex geometry

Use `ModelMesh` when the Script supplies vertices and topology. A drawable mesh also needs uploaded data, bounds and a SubMesh draw range. The minimal triangle below assumes an unlit, untextured material on the supplied Renderer; supply any additional attributes required by other materials.

```ts
import { Engine, MeshRenderer, ModelMesh, Vector3 } from "@galacean/engine";

export function createTriangle(engine: Engine, renderer: MeshRenderer): void {
  const mesh = new ModelMesh(engine);
  mesh.setPositions([new Vector3(-0.5, -0.5, 0), new Vector3(0.5, -0.5, 0), new Vector3(0, 0.5, 0)]);
  mesh.setIndices(new Uint16Array([0, 1, 2]));
  mesh.bounds.min.set(-0.5, -0.5, -0.001);
  mesh.bounds.max.set(0.5, 0.5, 0.001);
  mesh.uploadData(true);
  mesh.addSubMesh(0, 3);

  renderer.mesh = mesh;
}
```
