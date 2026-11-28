# PrimitiveMesh 资产格式

用 `editor.asset.create({path, type: "PrimitiveMesh", content: JSON.stringify(source)})` 创建 `.mesh` 资产。替换参数时，用 `editor.asset.update` 传入完整 JSON。path 只标识资产，创建资产不会创建场景 Entity。MeshRenderer 用 `mesh: { $ref: path }` 引用它。

这份 JSON 由 Engine 的 PrimitiveMeshLoader 读取。顶层有小写的 `type` 判别字段，以及下表中各形状的字段。这些是序列化的资产字段，不是 Engine `PrimitiveMesh.create*` 方法的参数名。那些方法属于 Script 运行时，不属于 execute。

| type | JSON 字段 |
| --- | --- |
| `sphere` | `sphereRadius`、`sphereStep` |
| `cuboid` | `cuboidWidth`、`cuboidHeight`、`cuboidDepth` |
| `plane` | `planeWidth`、`planeHeight`、`planeHorizontalSegments`、`planeVerticalSegments` |
| `cylinder` | `cylinderRadiusTop`、`cylinderRadiusBottom`、`cylinderHeight`、`cylinderRadialSegment`、`cylinderHeightSegment` |
| `torus` | `torusRadius`、`torusTubeRadius`、`torusRadialSegments`、`torusTubularSegments`、`torusArc` |
| `cone` | `coneRadius`、`coneHeight`、`coneRadialSegment`、`coneHeightSegment` |
| `capsule` | `capsuleRadius`、`capsuleHeight`、`capsuleRadialSegments`、`capsuleHeightSegments` |

- 长度和半径的单位是米。
- 分段数和 `sphereStep` 是整数。`sphereStep` 是细分深度，上限为 6。
- `torusArc` 的单位是度。
- 圆柱和圆锥的分段字段以单数 `Segment` 结尾。胶囊、圆环和平面的分段字段以复数 `Segments` 结尾。
- 不要写其他形状的字段。省略的参数使用 Engine 默认值。任务指定尺寸时，要明确写出尺寸。
- 胶囊高度是两端半球球心之间的圆柱段高度，不含半球。

半径 2 米、细分深度 3 的球体：

```json
{ "type": "sphere", "sphereRadius": 2, "sphereStep": 3 }
```

宽 2 米、高 3 米、深 4 米的立方体：

```json
{ "type": "cuboid", "cuboidWidth": 2, "cuboidHeight": 3, "cuboidDepth": 4 }
```

默认值和网格生成语义见 [PrimitiveMesh](declare/engine/node_modules/@galacean/engine-core/types/mesh/PrimitiveMesh.d.ts) 的注释。PrimitiveMeshLoader 在内部注册，它的声明不包含这份 JSON 格式。
