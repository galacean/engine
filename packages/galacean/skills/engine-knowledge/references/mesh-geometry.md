# Mesh Geometry

Use this reference when Scripts initialize, generate, share, or update geometry. Read the installed factory and mesh declarations for exact inputs, units, UV mapping, and material-slot order.

## Initialize or generate geometry

Reuse an existing configured mesh when its geometry already meets the task. Create a runtime mesh when Script behavior drives the shape or vertex data, or in standalone applications.

Create the mesh during initialization when its inputs are known. Rebuild when shape inputs change (such as a runtime path); mutating the input array alone does not update a generated primitive. Keep the mesh while its geometry stays fixed and use Entity transforms for placement, rotation, and per-instance scaling; update vertex attributes in place when only vertex data changes.

Use `PrimitiveMesh` factories for standard primitives (`createSphere`, `createCuboid`, `createPlane`, etc.) and procedural shapes (`createRevolvedSurface` for a profile rotated around an axis, `createTube` for a circular section along a path, `createPolygon` for a flat contour, `createExtrudedPolygon` to extend a contour by depth or path).

The following helper generates a tube from a runtime path and assigns it to an existing `MeshRenderer` whose material is already configured:

```ts
import { MeshRenderer, ModelMesh, PrimitiveMesh, Vector3 } from "@galacean/engine";

export function createRuntimeTube(renderer: MeshRenderer, path: readonly Vector3[], radius: number): ModelMesh {
  const mesh = PrimitiveMesh.createTube(renderer.engine, path, radius);
  renderer.mesh = mesh;
  return mesh;
}
```

## Share and replace geometry

Renderers assigned the same mesh share its geometry. Create an independent mesh when one object's geometry must change independently; Entity transforms can still differ across users of a shared mesh.

When rebuilding changes the sub-mesh layout, update the Renderer's material assignments to match. Retire replaced meshes according to their remaining users and [resource ownership](resource-ownership.md). Material sharing is covered in [rendering-and-color.md](rendering-and-color.md).

## Update existing vertex data

Request readable mesh data when the Script needs to read or edit vertex attributes later (for primitives, pass `keepMeshData: true` at creation). After editing a returned attribute array, call its setter and `uploadData(false)` while further CPU-side edits remain.

Keep indices and `SubMesh` draw ranges consistent with the vertex arrays when topology changes.

Update `mesh.bounds` after position changes so culling matches the deformed geometry, and update normals/tangents when the material uses them. Retaining readable data alone does not preserve runtime edits across device loss; use the mesh restoration contract to regenerate runtime state if needed.

## Place geometry and configure collision

Compare rendered bounds in world space when aligning runtime pieces. To sit a piece on horizontal ground, compute the vertical offset from world-space `Renderer.bounds.min.y` to the ground's world Y and apply it to the Entity's world position (these bounds already include mesh origin and Entity transforms).

Meshes and collider shapes have independent dimensions: assigning a mesh never configures its collider. Size collider shapes from the intended geometry and Entity scale; see [physics-setup.md](physics-setup.md).

## Supply custom vertex geometry

Use `ModelMesh` for custom vertices and topology. A drawable mesh requires uploaded vertex/index data, `bounds`, and a `SubMesh` draw range. The helper below binds Script-generated triangle geometry to an existing `MeshRenderer` (assuming valid triangle data and an unlit, untextured material; supply additional vertex attributes if the material requires them):

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
