# Mesh Geometry

Use this reference when Scripts initialize, generate, share or update geometry. Read the installed factory and mesh declarations for exact inputs, units, UV mapping and material-slot order.

## Initialize or generate geometry

Reuse a configured mesh when its geometry already meets the task. In Editor-managed projects, keep supported, persisted mesh configuration in the Editor API. A Script can create geometry needed by its behavior, including an initial mesh it later deforms or a shape the host API cannot express. Standalone applications also create their initial scene geometry.

Create the mesh during initialization when its inputs are already known. Rebuild when shape inputs change, such as a path chosen during play; changing the input array alone does not update a generated primitive. Keep the mesh while its geometry is unchanged, and use Entity transforms for placement, rotation and per-instance scaling. When only vertex attributes change, update them on the existing mesh.

For Script-generated shapes, use `createRevolvedSurface` for a profile rotated around an axis, `createTube` for a circular section following a path, `createPolygon` for a flat contour, and `createExtrudedPolygon` to extend a contour by a depth or along a path. Choose the factory from the intended shape, then consult its declaration for the exact inputs and settings.

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

Compare rendered bounds in a common space when aligning runtime pieces. To align a piece's bounds with horizontal ground, calculate the vertical offset from its world-space `Renderer.bounds.min.y` to the ground's world Y, and apply that offset to the Entity's world position. These bounds already account for the mesh origin and Entity transforms.

Meshes and collider shapes have independent dimensions: assigning a mesh does not configure its collider. Set collision dimensions from the intended geometry, accounting for Entity scale. See [physics-setup.md](physics-setup.md) for collision and picking.

## Supply custom vertex geometry

Use `ModelMesh` when the Script supplies vertices and topology. A drawable mesh also needs uploaded data, bounds and a SubMesh draw range. The helper below binds Script-generated triangle geometry to an existing Renderer and retains readable data for later edits. It assumes nonempty, valid triangle data and an unlit, untextured material; supply any additional attributes required by other materials.

```ts
import { BoundingBox, MeshRenderer, ModelMesh, Vector3 } from "@galacean/engine";

export function createRuntimeMesh(
  renderer: MeshRenderer,
  positions: Vector3[],
  indices: Uint16Array | Uint32Array
): ModelMesh {
  const mesh = new ModelMesh(renderer.engine);
  mesh.setPositions(positions);
  mesh.setIndices(indices);
  BoundingBox.fromPoints(positions, mesh.bounds);
  mesh.addSubMesh(0, indices.length);
  mesh.uploadData(false);

  renderer.mesh = mesh;
  return mesh;
}
```
