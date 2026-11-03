# PrimitiveMesh asset format

Use `editor.asset.create({path, type: "PrimitiveMesh", content: JSON.stringify(source)})` to create a `.mesh` asset. To replace its parameters, use `editor.asset.update` with the complete JSON. The path identifies the asset; creating it does not create a scene Entity. A MeshRenderer uses `mesh: { $ref: path }`.

The JSON is consumed by Engine PrimitiveMeshLoader. It has a lowercase `type` discriminator and the shape-specific fields below at the top level. These are serialized asset fields, not the argument names of Engine `PrimitiveMesh.create*` methods. Those Engine methods belong to Script runtime, not execute.

| type | JSON fields |
| --- | --- |
| `sphere` | `sphereRadius`, `sphereStep` |
| `cuboid` | `cuboidWidth`, `cuboidHeight`, `cuboidDepth` |
| `plane` | `planeWidth`, `planeHeight`, `planeHorizontalSegments`, `planeVerticalSegments` |
| `cylinder` | `cylinderRadiusTop`, `cylinderRadiusBottom`, `cylinderHeight`, `cylinderRadialSegment`, `cylinderHeightSegment` |
| `torus` | `torusRadius`, `torusTubeRadius`, `torusRadialSegments`, `torusTubularSegments`, `torusArc` |
| `cone` | `coneRadius`, `coneHeight`, `coneRadialSegment`, `coneHeightSegment` |
| `capsule` | `capsuleRadius`, `capsuleHeight`, `capsuleRadialSegments`, `capsuleHeightSegments` |

Lengths and radii use meters. Segment counts and `sphereStep` are integers; `sphereStep` is subdivision depth, capped at 6. `torusArc` uses degrees. Cylinder/cone field names end in singular `Segment`; capsule/torus/plane fields use plural `Segments`. Omit fields for other shapes. Omitted parameters use their Engine defaults; set dimensions explicitly when the task specifies them. Capsule height is the cylindrical section between hemisphere centers, excluding the caps.

A sphere with radius 2 meters and subdivision depth 3:

```json
{ "type": "sphere", "sphereRadius": 2, "sphereStep": 3 }
```

A cuboid 2 meters wide, 3 meters high and 4 meters deep:

```json
{ "type": "cuboid", "cuboidWidth": 2, "cuboidHeight": 3, "cuboidDepth": 4 }
```

For default values and mesh generation semantics, see the comments on [PrimitiveMesh](../../declare/runtime/node_modules/@galacean/engine-core/types/mesh/PrimitiveMesh.d.ts). PrimitiveMeshLoader itself is registered internally, so its emitted declaration does not expose this JSON format.
