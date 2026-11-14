# Mesh Geometry

Use this reference when primitive dimensions or orientation affect code, or when uploading custom geometry. Material assignment and draw ordering are covered in [rendering-and-color.md](rendering-and-color.md).

Dimensions are required factory arguments, expressed in local units. The table assumes an entity scale of `(1, 1, 1)`.

| Primitive | Local extent                                                | Local orientation            |
| --------- | ----------------------------------------------------------- | ---------------------------- |
| Cuboid    | `width`, `height`, `depth`                                  | centered at the origin       |
| Sphere    | diameter `2 * radius`                                       | centered at the origin       |
| Plane     | X size `width`, Z size `height`                             | lies in XZ and faces +Y      |
| Cylinder  | radius `radius`, Y size `height`                            | centered on Y                |
| Cone      | base radius `radius`, Y size `height`                       | centered on Y, tip toward +Y |
| Capsule   | radius `radius`, total Y size `height + 2 * radius`         | centered on Y                |
| Torus     | outer radius `radius + tubeRadius`, Z size `2 * tubeRadius` | lies in XY around the Z axis |

## Placement consequences

- A centered primitive rests on a horizontal surface when its center is raised by its scaled half-height.
- A Plane is already horizontal; rotating it as if it were an XY plane changes the intended ground orientation.
- Capsule `height` describes the cylindrical section between hemisphere centers. Total vertical extent also includes both hemispherical radii.
- Non-uniform entity scale changes the rendered bounds after mesh construction. Do not assume one scalar radius still describes the world-space result.

## Visual and collision geometry

Primitive meshes and collider shapes own independent dimensions. Set collider dimensions from the intended collision geometry; the assigned mesh does not configure them. Collider dimensions are then affected by the Entity's world scale.

Exact argument meanings, option fields and defaults remain declaration-owned.

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

Each factory takes required shape inputs followed by one optional named settings object. Dimensions, radii, contours and paths have no API defaults. Subdivision counts, angular ranges and mesh settings remain optional. Every shape has a public options type, such as `SphereMeshOptions`; the four regular polyhedra share `RegularPolyhedronMeshOptions`. Query the factory and its options type for argument meanings, units and option defaults.

For example, `createSphere(engine, 1, { subdivisions: 3 })` specifies the radius and subdivision level. `createCuboid(engine, 2, 3, 4)` requires all three dimensions. `createPlane(engine, 2, 3)` specifies its X and Z sizes. Later plane/cuboid subdivision counts use the first direction by default.

`createCylinder(engine, radius, height)` creates equal end radii. Use `createTruncatedCone(engine, topRadius, bottomRadius, height)` for different radii. Tubes take a required `Vector3` path and radius followed by `TubeMeshOptions`; lathe profiles take a required `Vector2` array followed by `LatheMeshOptions`.

Torus-knot `p` and `q` are required signed integer revolution counts, independent of mesh subdivisions. Negative values reverse the corresponding winding direction; zero keeps that angle fixed.

Angles use degrees. Ranges use `Vector2`, with `x` as the start angle and `y` as the end angle, such as `new Vector2(30, 180)`. Spherical sections use `horizontalRange` and `verticalRange` in their options. Cylinder and frustum `caps` use the exported `PrimitiveMeshCapMode` enum: `Both` (default), `Top`, `Bottom`, `None`. Top faces +Y and bottom faces -Y; angular cut boundaries remain open. Cones use a boolean `cap`. Plane is in XZ facing +Y; circles, rings and polygons are in XY facing +Z. Capsule height excludes its hemispheres.

`createSphere(engine, radius, { subdivisions, horizontalRange, verticalRange })` projects a subdivided cube onto a sphere. The subdivision level defaults to 3 and is clamped to 1 through 6. It accepts `horizontalRange` and `verticalRange`. These clip the subdivided surface and leave open boundaries. Horizontal angles start at -X towards +Z, and vertical angles start at +Y. Continuous horizontal intervals such as `new Vector2(350, 370)` cross the seam. Complete spheres and sections use the same subdivision level.

Additional generators include circle, ring, four regular polyhedra, lathe, tube, polygon, extrusion, torus knot and rounded cuboid. Angle ranges belong to options. Rings require the outer radius first, followed by the inner radius. Contours and lathe profiles use `Vector2` arrays; paths accept `Vector3` arrays and are sampled at equal distances along their line segments. Sample curves into points outside the mesh API. A simple polygon is a point array; holes use `{ points, holes }`. Extrusion takes a required numeric depth or `Vector3` path as its third argument, followed by `LinearExtrusionMeshOptions` or `PathExtrusionMeshOptions`. Each interface declares its mode's optional settings. A path selects path extrusion and ignores bevel settings; a numeric depth extrudes along +Z and ignores `closed`. Straight extrusion defaults to no bevel; a positive `bevelSize` enables it, with `bevelThickness` defaulting to the same value. Path extrusion has no bevels.

For straight extrusion, `bevelOffset` shifts the side-wall outline and defaults to `0`. Positive values expand the solid and contract holes; negative values do the reverse. The offset also applies when `bevelSize` is `0`. Bevels are cut into the shifted outline and included in the total `depth`.

For tubes and path extrusions, `closed` defaults to `false`. When enabled, the path ends join with matching cross-sections, and the closing point need not be repeated. Closed extrusions use at least three steps and have no end caps. Open extrusions have both end caps; tubes have no end caps in either mode.

Mesh settings share the same options object. `keepData` retains readable CPU attributes and defaults to false. `separateMaterials` defaults to false and is only available for cuboids, cylinders, truncated cones, cones, polygons, extrusions and rounded cuboids. With it enabled, cuboid slots follow +Y, -Y, -X, +X, +Z, -Z; cylinders use side, top, bottom; cones use side, bottom. Disabled or zero-radius caps do not reserve slots. Polygon slots follow shape order, with holes sharing the outer contour's slot. Each open extrusion shape contributes two consecutive slots: both caps, then all walls and bevels. Closed path extrusions contribute one wall slot per shape. Rebuilding a mesh with different parts requires matching the material array to its new slot order. Input values are captured at creation for deterministic device restoration.

## Serializable primitive assets

`PrimitiveMeshAsset` is exported from `@galacean/engine` and `@galacean/engine-loader` and covers every `PrimitiveMesh.createX` method. Each asset `type` uses the matching lower-camel name: `sphere`, `cuboid`, `plane`, `cylinder`, `truncatedCone`, `cone`, `capsule`, `torus`, `circle`, `ring`, `tetrahedron`, `octahedron`, `icosahedron`, `dodecahedron`, `lathe`, `tube`, `polygon`, `extrusion`, `torusKnot`, `roundedCuboid`.

JSON keeps the type prefix for required geometry inputs and the optional settings object: `{ type: "sphere", sphereRadius: 1, sphereOptions: { subdivisions: 3, keepData: true } }`. Each `<type>Options` uses the factory's named configuration fields and omitted defaults. Angular ranges store `Vector2` components as `{ x, y }`, for example `{ type: "circle", circleRadius: 1, circleOptions: { angleRange: { x: 30, y: 180 } } }`. `sphere` uses the subdivided-cube algorithm; `sphereOptions.subdivisions` sets its subdivision level. `cylinderRadius` controls both end radii; unequal radii use `truncatedConeTopRadius` and `truncatedConeBottomRadius`.

TypeScript assets use `PrimitiveMeshCapMode` for `caps`; JSON stores its string values `"both"`, `"top"`, `"bottom"`, `"none"`.

Serialized profiles and contours use `{ x, y }`; paths use `{ x, y, z }`. `polygonShapes` and `extrusionShapes` are arrays of `{ points, holes? }`. Straight extrusion requires `extrusionDepth`; path extrusion requires `extrusionPath` and ignores bevel settings. Set `extrusionOptions.closed` to `true` for a closed path without end caps. Editor previews and saved assets must select the same factory and parameters.
