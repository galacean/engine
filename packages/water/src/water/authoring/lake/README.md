# Lake：闭合样条与水平水位

Lake 的岸线由 `LakeBoundaryV1` 定义：XZ 控制点、可选绝对坐标 Bézier 入/出手柄、闭合环与一个 `waterLevel`。不重复最后一个控制点；缺少手柄的线段为直线。湖底高程与可选波浪分别存放在 bathymetry 和 wave asset 中，不用控制点 Y 表示湖底深浅。

## 作者入口和主链

外部地形可以通过 `createLakeFromTerrain` 接入。模式、示例与地形契约见 [外部地形接入](./LakeTerrainIntegration.md)。

使用 `createLake({ id, boundary, grid, bedHeights, waveAsset, quality, surfaceMotion, spatialField })` 创建描述，再通过现有 `createHeightfieldWaterBodySourceDescriptorV1` 与 `createHeightfieldWaterRepresentationDataV1` 注册 WaterBody。`boundary` 不含 `queryCoverage`，该入口自动设为 `boundary`。`grid` 必须覆盖完整样条，`bedHeights` 是整个格网的独立底高程，长度为 `width × height`，湖内底高程不得高于基础水位；`queryCoverage: "boundary"` 的湖外干地支撑点保留真实床高，用于岸边插值。

闭合样条 → 误差受控采样 → 合法性验证 → 凹多边形/岛洞三角化 → Heightfield 编译器 → CompiledResource/Worker → WaterBody Loader → 原 Heightfield Backend。Backend、Look、空间场纹理、查询提供者与 WaterSceneRuntimeHost 的生命周期仍然复用。网格顶点共享，基础法线向上，顶点 Y 都等于水位。存在物理波浪时，在共享格网上细分后交给原波浪链。

作者入口的完整格网提供岸边插值支持，不表示整个矩形都是湖：CPU 查询及 GPU 岸距均从同一份采样边界获得。CPU 岸距为到折线的精确距离；GPU 岸距仍受纹理分辨率和编码精度限制。深度插值仍受 bed grid 精度限制。

## 自动湖迁移

`attachLakeGridBoundary` 仅跟踪已确定的湿格并生成确定性的闭合直线样条，不重新推断流域、不平滑扩张 Ownership。它保留 `queryCoverage: source-grid`：Hydrology/Terrain 的已有查询归属和深度数据仍是权威。

| 入口 | 边界来源 |
| --- | --- |
| Integrated World Terrain-region Lake | 原 WaterRegion 的湿格并集 |
| SeedWorld 自动生成 Lake | 原 lakeSurface 的 basinSupport 与 Terrain 水位交界覆盖；原地形覆盖场继续参与着色 |
| SeedWorld 作者新增 pond/lake | 既有湖盆计算后的湿格并集；保留 persistent 水位与地形所有权 |

自动湖为保真而使用直线段，不把粗格边界自动拟合成可能越过原水域的光滑曲线。自然湖渲染边界继承既有覆盖格精度；CPU Ownership 继续用原逻辑格，二者不宣称逐点完全相同。旧的任意 Heightfield 编译入口仍可用于非 Lake 栅格曲面；它不再是以上 Lake 案例的网格来源。

## 输入失败和几何限制

- 至少一个闭合环，每环至少三个点；使用奇偶填充支持凹边界、岛洞和多个区域，方向不影响结果。
- `maxChordError` 控制 Bézier 控制多边形到采样弦的距离上限；`maxSegmentLength` 限制边界弦长。采样上限 8192 点、递归上限 24 层，超限明确失败。
- 拒绝非有限值、重复端点、零面积、自交及作者环相切；来自湿格的四连通区域允许共享离散顶点，保留格网拓扑。
- 三角化采用确定性的水平扫描，支持凹多边形与岛洞，但不是 UE 的 constrained Delaunay，也不承诺最优最小角或完全没有细长三角形。
- 原编译器的顶点、三角形、块数、Query 与 atlas 预算继续生效；不能通过提供样条跳过这些限制。
- 网格细分保障可选波浪的采样密度；已有波浪模型的精度和性能边界不变，不提供新的流体模拟。
