# Lake 外部地形接入与湖盆修改

## 本期实现与数据方向

```text
地形所有者持有 Base WaterTerrainSnapshot
  ├─ 已有湖盆 → createLakeFromTerrain → 现有 Heightfield / WaterBody 链
  └─ 显式雕刻 → compileLakeTerrainModifier → LakeTerrainPatch
                  → 所有者 applyLakeTerrainPatches(Base, activePatches, revision)
                  → Derived WaterTerrainSnapshot → createLakeFromTerrain
```

Water 运行时不修改 Terrain。修改编译与高度网格适配器都是纯 CPU 函数，没有 DOM、GPU 或 SeedWorld 依赖。调用方负责将最终地形网格、水体和查询一起发布；单湖 Demo 继续使用已有 prepare / commit / rollback 事务。

## 设计问题：为什么，以及是否有更好的办法

| 问题 | 本次选择及原因 | 替代方案与边界 |
| --- | --- | --- |
| Water 与 Terrain 都涉及湖床，最终以谁为准？ | 地形所有者持有 Base、应用显式修改并发布 Derived；Lake 只读 Derived。正式 Terrain 可以替换 mock 适配器。 | 直接在 Backend 改地形会制造第二个高度权威；依赖正式 Terrain 完成则会阻塞独立能力验证。两者都不适合当前阶段。 |
| 为什么复用 `WaterTerrainSnapshot`？ | 它已有坐标、网格、版本和不可变高度语义，River 也使用它。Lake 只增加适配，不引入另一套外部 Terrain 接口。 | 现有 `LakeTerrainSnapshot` 是 Heightfield 显示与查询的局部视图，暂时保留；全仓库迁移这个内部类型不会增加本期功能，还会扩大对其他消费者的影响。 |
| 为什么修改结果是绝对床高而不是高度增量？ | `LakeTerrainPatch` 记录基础快照哈希、背景及每个 refinement 的修改顶点和绝对高度。相同 Base 重放结果相同，移动或移除时从 Base 和剩余修改重新派生，不累积挖深。 | 对上一次 Derived 继续减去深度无法可靠撤销。当前 API 拒绝把旧 patch 应用到不同 id、revision 或内容的 Base；基础地形变化后应重新编译修改。 |
| 只挖低是否限制了湖盆效果？ | `carve-only` 保留已有更深地面和影响范围外地形，重叠 Lake patch 取最低值，结果与应用顺序无关。`depth` 是目标剖面深度，不是对已有深坑的填平命令。 | 填土、堤坝和有优先级的覆盖模式可以后续增加，但必须由地形所有者显式选择；本期不能靠抬地堵住河口来满足湖泊边界。 |
| 为什么将当前水位与湖盆基准分开？ | `referenceLevel` 决定床高目标，`boundary.waterLevel` 决定当前淹没水域。调水位只重建水面与查询，Demo 复用同一份 Derived 和地形网格。 | 用当前水位重新挖同样深度会让地面跟着水位移动，无法验证真实涨落水。 |
| 为什么保留两种水域模式？ | `terrain-basin` 在明确的局部数据范围内提取真实地形与水面交线；`authored` 使用调用方已有的闭合分区，适合 Lake–River–Ocean 连接。 | 全局 flood fill 会把连接水体吞入 Lake。任意多边形裁剪需要另行区分真实岸线和人为截断边界；本期对触及局部数据边缘的湿区直接报错，要求扩大闭合湖盆数据域或提供显式分区。 |
| 为什么局部范围必须与原网格对齐？ | `captureLakeTerrain` 保留有预算的 raster support，同时在存在 refinement 时携带不可变 `bedTerrain`。背景单元保持双线性，refinement 保持原 a–d 对角线三角面；相邻更细网格不能改变该对角线。 | 只复制顶点再双线性插值会改变非共面单元。CPU 查询直接读取 canonical bed；GPU local field 是对同一场采样的量化近似，不承担权威床高查询。 |
| 为什么先提供三种剖面，不移植 UE 的全部编辑层？ | `linear`、`smoothstep`、`natural` 配合深度、内岸坡宽度和外过渡宽度已覆盖本期可复用雕刻。借鉴 UE 的意图/地形合成分工，继续复用当前 CPU 编译链。 | 任意 Curve Asset、Jump Flood、GPU 地形笔刷与分块局部上传应在明确需求后增加。patch 的稀疏顶点和 bounds 不是“地形渲染已经增量上传”的承诺。 |

## Canonical Terrain 契约（2026-10-15）

- `WaterTerrainSnapshot` 的背景是双线性场，replacement refinement 是固定 a–d 对角线的三角面。`captureLakeTerrain` 的 `bedTerrain` 保留这份拓扑，`createLakeFromTerrain` 与 Planner 把它传入 Heightfield 的物理 Source；运行时 wet/depth、source hash、Worker 传输和重放都使用相同身份与床面。
- 提取岸线时，背景保留渐近鞍点判定与 0.025 m 弦误差，refinement 对原三角面逐面求交，不对更细 raster 单元重建另一条对角线。replacement 边界若有高度不连续，垂直接缝按两侧干湿分类形成岸线，不以改床高闭合轮廓。
- raster `bedHeights` 必须等于 canonical Terrain 在支持顶点的 Float32 值；它是 GPU atlas 的输入支持，不能取代精确 CPU 场。atlas 纹素中心直接采样 canonical Terrain，随后保留已有有限分辨率与 8 位量化；插值误差与量化误差应分别评估，CPU 一致性不能当作 GPU/视觉验收。
- canonical Terrain 的支持域到最外侧顶点为止，与 raster 的半格外沿不同。编译入口同时检查支持顶点和采样后的完整湖岸；湖岸超出 canonical 支持域时明确拒绝。湖岸恰好落在顶点边界合法；要使用 raster 半格外沿，调用方必须提供覆盖该区域的更大 canonical Terrain，不进行外推或缺失床面的边缘钳制。
- Lake/River modifier 对相同不可变 Base 的背景和每个 refinement 合成 absolute cut；每个 grid 保留自己的插值，不填高原地形。Lake patch 显式列出全部 refinement，应用时核对 ID、稀疏 cut、基础身份和预算，旧的仅背景 patch 不能静默用于 refined Base。派生发布版本由父 snapshot 的 `revision` 表达；子 grid 保留 Base 的身份与局部 revision，消费者必须连同实际高度内容判断变化，不能用子 revision 单独认定派生床面未变。
- 修改编译只在影响 bounds 内的格网顶点求值。Lake/River 在首次实际降低高度时才复制对应 grid；未变化的不可变 refinement 与高度数组继续共享，可变外部输入仍通过统一所有权边界复制。完整 Base 校验和 Lake 的基础身份哈希仍需读取输入，不能将此优化称为整个发布流程均与局部面积成正比。
- Heightfield compiled resource 的 `cpuStaticBytes/totalBytes` 计入每份唯一 canonical 高度数组的 `length × 8` 数值 payload，并经既有 compile-cache byte budget 拒绝超额资源。该数字不包含 JS 对象/数组头、坐标 tuple、Worker 临时副本或 GPU 内存，不能等同实际 heap 峰值；多个资源共享同一作者数组时，各资源分别保守记账。
- 发布结果复用 `copyWaterTerrainSnapshot` 的统一所有权边界；完整冻结输入可共享，可变数组与坐标需复制。River 编辑会话直接拥有 canonical Base，不通过重新采样背景顶点捕获；Ocean revision 同样通过该边界拥有背景及 refinement，编辑提交、撤销及 compiled bed/hash 不跨版本别名。
- Heightfield 查询服务构造时准备 canonical refinement 索引；采样使用数值 bucket 坐标和标量边界比较，不为地形寻址构造数组或字符串键。可变坐标不建立持久索引；共享边界按原 refinement 顺序归属，索引桶覆盖同一数值容差，背景双线性与 refinement 固定三角形插值不变。该保证仅限地形寻址，不代表整个 Water 查询或外部消费者零分配。

## 公共调用示例

```ts
// base 由 Terrain、模型或解析高度采样得到，并由调用方持有。
const patch = compileLakeTerrainModifier(base, referenceBoundary, {
  schemaVersion: 1,
  id: "main-lake-basin",
  lakeId: "main-lake",
  mode: "carve-only",
  referenceLevel: 3,
  depth: 4,
  shoreWidth: 8,
  falloffWidth: 4,
  profile: "natural"
});
const terrain = applyLakeTerrainPatches(base, [patch], nextRevision);
const descriptor = createLakeFromTerrain({
  ...lakeCompileOptions,
  terrain,
  coverage: { kind: "terrain-basin", waterLevel: 3 }
});
// 调用方随后共同准备、发布 terrain 的显示网格和 descriptor 的 WaterBody replacement。
```

读取现有地形时直接传 `base`，完全跳过修改编译与应用。可用 `bounds: [minX, minZ, maxX, maxZ]` 限定闭合湖盆的局部数据范围；范围内的所有有效闭合湿区属于此次输入，调用方应按所需 Lake 身份选择域。范围不是任意位置的人工挡水边界。

连接湖使用 `coverage: { kind: "authored", boundary }`，并照常传入 `connections`。调用方负责给出与地形相容的分区；已有高度验证拒绝分区内无效床面。`terrain-basin` 不接受连接数据，避免无意间替代原连接归属。

`authored.boundary` 与 `createLake` 使用同一作者输入类型，调用方无需填写内部的 `queryCoverage`；湖盆修改编译也接受这份轮廓。`createLakeFromTerrain` 对完整冻结的快照（包含 refinement、origin/heights）复用最近一次局部地形视图，缓存随快照释放；可变输入每次重新捕获。这样调水位不再重复读取外部高度或计算未使用的地形哈希，同时每份水体描述仍复制自己的高度缓冲区，避免调用方修改一份描述污染缓存或其它湖泊。

移动湖盆：以移动后的参考轮廓对同一 Base 编译新的 patch，替换 activePatches 中的旧项。删除湖泊：调用方移除其 patch，重新应用剩余项，并在同一发布事务卸载该水体。撤销：恢复旧参数/patch 再从同一 Base 派生。空 patch 集合返回 Base 本身。这里没有新增跨水体编辑器或自动发布调度器。

## Demo 接入

- 单湖入口 `/demos/water/?debug=1#showcase-grasslands-stylized-water`：Lake → `Terrain input / 地形输入` 提供丘陵雕刻、平地雕刻、现有湖盆只读三种输入。三种输入由 Demo 固定生成，均独立于当前可编辑轮廓与水位。
- 平地输入统一为 1.3 m；丘陵输入在远岸设置两座宽缓山丘，保留较低的前景，方便在主视角比较基础地形。两种模式使用相同湖盆剖面，水位 0 时湖内深度接近，主要差异在岸外地形。
- 只读模式允许水位变化；湖盆、falloff、光学标定与参考轮廓控件禁用并说明原因，API 仍拒绝相关修改并保留上一发布状态。切回雕刻模式、撤销或重置时，控件可用性跟随已发布状态刷新。
- `lakeDemo.setTerrainPreset("hills" | "flat" | "existing-basin")`、`setFalloffWidth(m)` 可用于验收；`snapshot()` 返回基础地形身份/版本与当前类型，`probe(x,z)` 同时返回 `baseHeight` 和实际床高。
- 湖盆移动不改变影响范围外的基础丘陵。改变地形后，景物按已有规则贴地并标记布局待更新，仍通过已有按钮显式重新生成。
- 岚湾岛四个 Lake 改用相同 `createLakeFromTerrain` 读取统一地形，保持显式分区与连接输入。当前并行开发中的 Ocean 编辑和岛屿地形合成不由本批改写。
- 光学标定的 0.25 / 1 / 2 米三段地形保留为 Demo 专用测试夹具，不进入公共湖盆修改参数。

## 验证范围

单元测试覆盖只读输入、局部域隔离、双线性插值、水位与床高独立、显式分区、平地/丘陵雕刻、影响范围、已有深坑、岛洞、相同 Base 重放、移动/删除/撤销、重叠修改顺序、过期版本、非法输入、编辑事务失败与取消。

### 2026-09-12 验证记录

- 基于 `bd2484bbb` 加本批 Lake 变更的临时源码副本：Water 类型检查通过；6 个相关测试文件、45 项测试通过，包含七个连接口的集成回归。不引入新 Git 分支或工作树。
- 共享工作区全量测试的一次记录为 1,084 项通过、2 项失败，失败位于并行编写中的 `OceanEditSession.test.ts`（历史窗口、取消后的回滚错误）。同批共享类型检查报 Ocean nearshore 输入缺少 `bedHeights`。这些不是本批 Lake 的验证结论，因此另做上述隔离检查，没有改写其他任务的实现来消除它们。
- 单湖入口生产构建通过，仍有 Vite 大 chunk 提示。本批不修改 Shader，没有重新压缩纹理或生成 AOT。
- Codex 内置浏览器实际切换平坦地形与现有湖盆；现有湖盆水位从 0 升至 0.3 m，地形哈希和地形上传次数保持不变，中心水深约 3.5 m。只读模式修改深度明确报错，保留之前发布版本。
- 平地雕刻模式将整条湖盆轮廓沿 X 移动 6 m：`(-27, 0)` 的床高从约 -0.438 m 恢复为 1.3 m，查询变为湖外；`(38, 25)` 仍与原基础地形同高。撤销后地形哈希恢复。
- 三轮退出和重新进入通过，包含一次编辑准备中退出。每轮退出后活动水体、自有/借用纹理、材质、存活网格和场景实体统计均为 0，未记录清理错误。
- 联合案例浏览器回归：九个水体就绪、编译次数为 9，控制台无 error/warn。仅检查 Lake 读取接入和默认场景，不将并行 Ocean 编辑面板算作本批交付或完整验收。
- 当前规则网格适配、静态 authored 分区及单湖编辑范围内验证；不宣称正式 Terrain 集成、多水体联合编辑或移动端性能验收完成。

### CR 修复验证（2026-09-12）

- 直接检查当前共享工作区：Water 类型检查通过；8 个相关测试文件、63 项测试通过，包含新加的冻结快照读取计数、局部范围变化、可变输入更新、描述缓冲区隔离和控件可用性切换。
- `authored` 接入与湖盆修改测试均使用不含 `queryCoverage` 的作者轮廓，通过编译及运行断言。
- Codex 内置浏览器真实操作：现有湖盆的 8 项雕刻控件禁用并显示原因；水位 0 → 0.3 m 后，地形哈希保持 `ff5a30f65726b7a8`，场景网格上传次数保持 14。
- 切回丘陵后控件恢复，将深度 3.2 → 3.8 m 可正常发布；通过撤销按钮的键盘操作恢复深度、再撤销回只读地形，控件再次禁用。重置后恢复丘陵地形、水位 0 和深度 3.2 m，控件恢复可用。
- 浏览器控制台无 error/warn；交互期间的完整事件记录没有异常或失败请求。初次加载事件缓冲区发生截断，因此不把它作为完整的首次加载网络记录。
- 单湖生产构建和差异空白检查通过。仍有现有 Vite 大 chunk 提示；本次未测量帧率或 GPU 耗时。

### 丘陵展示调整（2026-09-12）

- 原丘陵只有 1.3～2.4 m 的微起伏，无法清楚展示与平地的区别。本次只增强 Demo 丘陵输入；现有湖盆输入和公共雕刻算法沿用原实现。
- 内置浏览器切换验证：`(-22,-25)`、`(18,-28)` 两点在丘陵模式约为 10.2 m、6.9 m，在平地模式均为 1.3 m；两种模式的中心水深均约为 3.2 m。控制台无 error/warn，切换期间未记录失败请求。
- Water 类型检查、地形岸线/编辑发布/场景生命周期三个测试文件共 27 项测试通过。

### 2026-10-05 双线性高度场契约（历史记录，refinement 以 2026-10-15 契约为准）

- 公共 `sampleWaterTerrainHeight`、Lake 的 `sampleLakeTerrainHeight` 和 Heightfield 的标量查询统一双线性。Water 不对缺失覆盖进行边缘 clamp；非法网格/单元或越界返回 unresolved（Lake 标量接口返回 NaN），编译需要的床面不完整时拒绝候选。
- `WaterTerrainSnapshot.spacing` 为 X 间距，新增可选 `spacingZ`；省略时继续使用方格语义。Lake 捕获、湖盆/河床修改与 River 编辑边界按各轴间距计算。Planning 的 480×320 米合法输入无需重采样。
- `terrain-basin` 改为双线性 marching squares，以渐近鞍点判定决定连通关系。每个输出控制点位于精确等高线上；双线性等高线在单元内是有理曲线，使用二阶导数上界将整段弦的水平误差限制为 0.025 米。保留既有 8192 点预算，不能达到精度时明确失败。
- 派生边界携带 `terrainShorelineTolerance`；查询只在该近似带内允许越过折线，再用实际双线性床高与水位判定湿侧和深度，岸距符号随实际干湿修正。凹岸、岛洞和涨落水不靠修改床高实现。水位恰好通过鞍点而使轮廓自触时，现有非自触闭合环契约明确拒绝；鞍点上下两侧的连通转换有回归覆盖。
- 几何三角形命中与重心坐标仍用于真实水面几何，不属于高度网格采样迁移。Lake 显示岸线是上述精度的折线近似，地形显示三角面与双线性床面在非共面单元内部并非逐点重合；本项不重构地形渲染网格。
