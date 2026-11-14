# Lake 外部地形接入

## 数据方向

Water 通过 `createLakeFromTerrain` 读取调用方提供的 `WaterTerrainSnapshot`，复用 Heightfield / WaterBody 链。Water 运行时不修改 Terrain；调用方负责将地形网格、水体和查询一起发布。

## Canonical Terrain 契约（2026-10-15）

- `WaterTerrainSnapshot` 的背景是双线性场，replacement refinement 是固定 a–d 对角线的三角面。`captureLakeTerrain` 的 `bedTerrain` 保留这份拓扑，`createLakeFromTerrain` 与 Planner 把它传入 Heightfield 的物理 Source；运行时 wet/depth、source hash、Worker 传输和重放都使用相同身份与床面。
- 提取岸线时，背景保留渐近鞍点判定与 0.025 m 弦误差，refinement 对原三角面逐面求交，不对更细 raster 单元重建另一条对角线。replacement 边界若有高度不连续，垂直接缝按两侧干湿分类形成岸线，不以改床高闭合轮廓。
- raster `bedHeights` 必须等于 canonical Terrain 在支持顶点的 Float32 值；它是 GPU atlas 的输入支持，不能取代精确 CPU 场。atlas 纹素中心直接采样 canonical Terrain，随后保留已有有限分辨率与 8 位量化；插值误差与量化误差应分别评估，CPU 一致性不能当作 GPU/视觉验收。
- canonical Terrain 的支持域到最外侧顶点为止，与 raster 的半格外沿不同。编译入口同时检查支持顶点和采样后的完整湖岸；湖岸超出 canonical 支持域时明确拒绝。湖岸恰好落在顶点边界合法；要使用 raster 半格外沿，调用方必须提供覆盖该区域的更大 canonical Terrain，不进行外推或缺失床面的边缘钳制。
- Heightfield compiled resource 的 `cpuStaticBytes/totalBytes` 计入每份唯一 canonical 高度数组的 `length × 8` 数值 payload，并经既有 compile-cache byte budget 拒绝超额资源。该数字不包含 JS 对象/数组头、坐标 tuple、Worker 临时副本或 GPU 内存，不能等同实际 heap 峰值；多个资源共享同一作者数组时，各资源分别保守记账。
- Heightfield 查询服务构造时准备 canonical refinement 索引；采样使用数值 bucket 坐标和标量边界比较，不为地形寻址构造数组或字符串键。可变坐标不建立持久索引；共享边界按原 refinement 顺序归属，索引桶覆盖同一数值容差，背景双线性与 refinement 固定三角形插值不变。该保证仅限地形寻址，不代表整个 Water 查询或外部消费者零分配。

## 公共调用示例

```ts
// base 由 Terrain、模型或解析高度采样得到，并由调用方持有。
const descriptor = createLakeFromTerrain({
  ...lakeCompileOptions,
  terrain: base,
  coverage: { kind: "terrain-basin", waterLevel: 3 }
});
// 调用方准备并发布 descriptor 的 WaterBody replacement。
```

读取现有地形时直接传 `base`。可用 `bounds: [minX, minZ, maxX, maxZ]` 限定闭合湖盆的局部数据范围；范围内的所有有效闭合湿区属于此次输入，调用方应按所需 Lake 身份选择域。范围不是任意位置的人工挡水边界。

连接湖使用 `coverage: { kind: "authored", boundary }`，并照常传入 `connections`。调用方负责给出与地形相容的分区；已有高度验证拒绝分区内无效床面。`terrain-basin` 不接受连接数据，避免无意间替代原连接归属。

`authored.boundary` 与 `createLake` 使用同一作者输入类型，调用方无需填写内部的 `queryCoverage`。`createLakeFromTerrain` 对完整冻结的快照（包含 refinement、origin/heights）复用最近一次局部地形视图，缓存随快照释放；可变输入每次重新捕获。这样调水位不再重复读取外部高度或计算未使用的地形哈希，同时每份水体描述仍复制自己的高度缓冲区，避免调用方修改一份描述污染缓存或其它湖泊。
