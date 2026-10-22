# Mesh Geometry

Use this reference when primitive dimensions or orientation affect code, or when uploading custom geometry. Material assignment and draw ordering are covered in [rendering-and-color.md](rendering-and-color.md).

The table describes meshes created with omitted size arguments and an entity scale of `(1, 1, 1)`.

| Primitive          | Default extent                                   | Local orientation            |
| ------------------ | ------------------------------------------------ | ---------------------------- |
| Cuboid             | width 1, height 1, depth 1                       | centered at the origin       |
| Sphere             | radius 0.5                                       | centered at the origin       |
| Subdivision sphere | radius 0.5                                       | centered at the origin       |
| Plane              | width 1, depth 1                                 | lies in XZ and faces +Y      |
| Cylinder           | radius 0.5, height 2                             | centered on Y                |
| Cone               | radius 0.5, height 2                             | centered on Y, tip toward +Y |
| Capsule            | radius 0.5, cylindrical height 2, total height 3 | centered on Y                |
| Torus              | major radius 0.5, tube radius 0.1                | lies in XY around the Z axis |

## Placement consequences

- A centered primitive rests on a horizontal surface when its center is raised by its scaled half-height.
- A default Plane is already horizontal; rotating it as if it were an XY plane changes the intended ground orientation.
- Capsule `height` describes the cylindrical section between hemisphere centers. Total vertical extent also includes both hemispherical radii.
- Non-uniform entity scale changes the rendered bounds after mesh construction. Do not assume one scalar radius still describes the world-space result.

## Visual and collision geometry

Primitive meshes and collider shapes own independent dimensions. Their defaults do not guarantee a visual match: for example, a default Sphere mesh has radius `0.5` while a default `SphereColliderShape` has radius `1`; the default Capsule mesh and `CapsuleColliderShape` also use different radii. Collider dimensions are then affected by the Entity's world scale.

Set collider dimensions from the intended collision geometry. Do not infer them from the assigned mesh or assume entity scale repairs a default mismatch.

Exact constructor arguments remain declaration-owned. Use this page only for the default spatial semantics that are easy to misremember.

## Draw-ready custom mesh

Use this example for procedural geometry created during execution. The caller supplies a Renderer with its material already configured. Fixed geometry and reusable templates are normally authored assets. Vertex data alone is not drawable: the Mesh still needs bounds, an index range and a SubMesh. See [rendering-and-color.md](rendering-and-color.md).

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
