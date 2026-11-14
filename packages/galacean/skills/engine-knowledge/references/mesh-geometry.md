# Mesh Geometry

Use this reference when primitive dimensions or orientation affect code, or when uploading custom geometry. Material assignment and draw ordering are covered in [rendering-and-color.md](rendering-and-color.md).

The table describes meshes created with default options and an entity scale of `(1, 1, 1)`.

| Primitive | Default extent                                   | Local orientation            |
| --------- | ------------------------------------------------ | ---------------------------- |
| Cuboid    | width 1, height 1, depth 1                       | centered at the origin       |
| Sphere    | radius 0.5                                       | centered at the origin       |
| Plane     | width 1, depth 1                                 | lies in XZ and faces +Y      |
| Cylinder  | radius 0.5, height 2                             | centered on Y                |
| Cone      | radius 0.5, height 2                             | centered on Y, tip toward +Y |
| Capsule   | radius 0.5, cylindrical height 2, total height 3 | centered on Y                |
| Torus     | major radius 0.5, tube radius 0.1                | lies in XY around the Z axis |

## Placement consequences

- A centered primitive rests on a horizontal surface when its center is raised by its scaled half-height.
- A default Plane is already horizontal; rotating it as if it were an XY plane changes the intended ground orientation.
- Capsule `height` describes the cylindrical section between hemisphere centers. Total vertical extent also includes both hemispherical radii.
- Non-uniform entity scale changes the rendered bounds after mesh construction. Do not assume one scalar radius still describes the world-space result.

## Visual and collision geometry

Primitive meshes and collider shapes own independent dimensions. Their defaults do not guarantee a visual match: for example, a default Sphere mesh has radius `0.5` while a default `SphereColliderShape` has radius `1`; the default Capsule mesh and `CapsuleColliderShape` also use different radii. Collider dimensions are then affected by the Entity's world scale.

Set collider dimensions from the intended collision geometry. Do not infer them from the assigned mesh or assume entity scale repairs a default mismatch.

Exact option fields and defaults remain declaration-owned. Use this page only for the default spatial semantics that are easy to misremember.

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

## Procedural generators

Each factory accepts one named options object, with dimensions, subdivision counts and mesh settings in that object. Every shape has a public options type, such as `SphereMeshOptions`; the four regular polyhedra share `RegularPolyhedronMeshOptions`. Query the factory and its options type for fields, units and defaults.

For example, `createSphere(engine, { radius: 1, subdivisions: 3 })` sets radius and subdivision level. `createCuboid(engine, { width: 2 })` creates a cube with all dimensions equal to 2; omitted plane height likewise uses its width. Later plane/cuboid subdivision counts use the first direction by default.

`createCylinder(engine, { radius, height })` creates equal end radii. Use `createTruncatedCone(engine, { topRadius, bottomRadius, height })` for different radii. Tubes take a required `Vector3` path followed by `TubeMeshOptions`; lathe profiles take a required `Vector2` array followed by `LatheMeshOptions`.

Torus-knot `p` and `q` are signed integer revolution counts, independent of mesh subdivisions. Negative values reverse the corresponding winding direction; zero keeps that angle fixed.

Angles use degrees. Ranges use `Vector2`, with `x` as the start angle and `y` as the end angle, such as `new Vector2(30, 180)`. Spherical sections use `horizontalRange` and `verticalRange` in their options. Cylinder and frustum `caps` use the exported `PrimitiveMeshCapMode` enum: `Both` (default), `Top`, `Bottom`, `None`. Top faces +Y and bottom faces -Y; angular cut boundaries remain open. Cones use a boolean `cap`. Plane is in XZ facing +Y; circles, rings and polygons are in XY facing +Z. Capsule height excludes its hemispheres.

`createSphere(engine, { radius, subdivisions, horizontalRange, verticalRange })` projects a subdivided cube onto a sphere. The subdivision level defaults to 3 and is clamped to 1 through 6. It accepts `horizontalRange` and `verticalRange`. These clip the subdivided surface and leave open boundaries. Horizontal angles start at -X towards +Z, and vertical angles start at +Y. Continuous horizontal intervals such as `new Vector2(350, 370)` cross the seam. Complete spheres and sections use the same subdivision level.

Additional generators include circle, ring, four regular polyhedra, lathe, tube, polygon, extrusion, torus knot and rounded cuboid. Angle ranges belong to options. A ring's omitted `innerRadius` is half its `outerRadius`. Contours and lathe profiles use `Vector2` arrays; paths accept `Vector3` arrays and are sampled at equal distances along their line segments. Sample curves into points outside the mesh API. A simple polygon is a point array; holes use `{ points, holes }`. Extrusion takes `LinearExtrusionMeshOptions` with optional `depth`, or `PathExtrusionMeshOptions` with a required `path`. Each interface declares only its mode's settings. Providing `path` selects path extrusion and ignores depth and bevel settings; without a path, `closed` is ignored. Straight extrusion defaults to no bevel; a positive `bevelSize` enables it, with `bevelThickness` defaulting to the same value. Path extrusion has no bevels.

For straight extrusion, `bevelOffset` shifts the side-wall outline and defaults to `0`. Positive values expand the solid and contract holes; negative values do the reverse. The offset also applies when `bevelSize` is `0`. Bevels are cut into the shifted outline and included in the total `depth`.

For tubes and path extrusions, `closed` defaults to `false`. When enabled, the path ends join with matching cross-sections, and the closing point need not be repeated. Closed extrusions use at least three steps and have no end caps. Open extrusions have both end caps; tubes have no end caps in either mode.

Mesh settings share the same options object. `keepData` retains readable CPU attributes and defaults to false. `separateMaterials` defaults to false and is only available for cuboids, cylinders, truncated cones, cones, polygons, extrusions and rounded cuboids. With it enabled, cuboid slots follow +Y, -Y, -X, +X, +Z, -Z; cylinders use side, top, bottom; cones use side, bottom. Disabled or zero-radius caps do not reserve slots. Polygon slots follow shape order, with holes sharing the outer contour's slot. Each open extrusion shape contributes two consecutive slots: both caps, then all walls and bevels. Closed path extrusions contribute one wall slot per shape. Rebuilding a mesh with different parts requires matching the material array to its new slot order. Input values are captured at creation for deterministic device restoration.

## Serializable primitive assets

`PrimitiveMeshAsset` is exported from `@galacean/engine` and `@galacean/engine-loader` and covers every `PrimitiveMesh.createX` method. Each asset `type` uses the matching lower-camel name: `sphere`, `cuboid`, `plane`, `cylinder`, `truncatedCone`, `cone`, `capsule`, `torus`, `circle`, `ring`, `tetrahedron`, `octahedron`, `icosahedron`, `dodecahedron`, `lathe`, `tube`, `polygon`, `extrusion`, `torusKnot`, `roundedCuboid`.

JSON keeps the type prefix for geometry inputs and the options object: `{ type: "sphere", sphereOptions: { radius: 1, subdivisions: 3, keepData: true } }`. Each `<type>Options` uses the factory's named configuration fields and omitted defaults. Angular ranges store `Vector2` components as `{ x, y }`, for example `{ type: "circle", circleOptions: { angleRange: { x: 30, y: 180 } } }`. `sphere` uses the subdivided-cube algorithm; `sphereOptions.subdivisions` sets its subdivision level. `cylinderOptions.radius` controls both end radii; unequal radii use `truncatedConeOptions.topRadius` and `truncatedConeOptions.bottomRadius`.

TypeScript assets use `PrimitiveMeshCapMode` for `caps`; JSON stores its string values `"both"`, `"top"`, `"bottom"`, `"none"`.

Serialized profiles and contours use `{ x, y }`; paths use `{ x, y, z }`. `polygonShapes` and `extrusionShapes` are arrays of `{ points, holes? }`. Straight extrusion uses `extrusionOptions.depth`; path extrusion uses `extrusionOptions.path` and ignores depth and bevel settings. Set `extrusionOptions.closed` to `true` for a closed path without end caps. Editor previews and saved assets must select the same factory and parameters.
