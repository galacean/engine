# 建筑系统迁移清单

目标：建筑全部迁到新架构（应用层 → 构件类型层 → 核心层 → 单元渲染）之后，**删除线上旧路径和全部兼容代码**。新架构的规格见 [core/README.md](core/README.md)。

## 规则

1. **整体迁移完成后删除旧代码。** 下文“旧路径”中列出的代码，在最后一个阶段验收通过后全部删除，不保留开关、不保留回退。
2. **兼容代码与旧路径一起删除。** 兼容代码只为在两条路径并存期间做到逐字节对比而存在，每处都标记 `COMPAT(online-parity)`，可以用 `git grep "COMPAT(online-parity)"` 找全。
3. **兼容代码只能放在这些位置：** `application/`、`render/`、`tests/core/CoreParity.spec.ts`、`world/demos/building-core-preview/`。核心层禁止出现，由 `tests/core/CoreLayering.spec.ts` 检查。
4. **删除旧代码前先冻结基准。** 把线上路径对各用例的渲染包哈希保存为固定基准，`CoreParity.spec.ts` 改为与基准比较，然后再删除旧路径。
5. **不是兼容的未完成项不能删，要补实现。** 见文末“未完成项”。

## 阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| M1 | 独立墙、栅栏，含起伏地形 | 已完成：平地上不旋转的墙，渲染包逐字节相同（零的符号统一后）；栅栏、旋转、起伏地形的数值误差 < 1e-12 |
| M2 | 房屋：墙 + 屋顶，墙顶跟随屋顶轮廓 | 进行中：墙体用新架构的 `masonryCourses`；矩形坡屋顶（四坡、山墙、攒尖）用新架构的坡面构件；圆形屋顶仍由线上内核生成 |
| M3 | 台基、腰线、木墙、平屋顶 | 未开始 |
| M4 | 相连的房屋：对等检测、避让、转角砖 | 未开始 |
| M5 | 门窗开洞、老虎窗、拱、尖顶、挂件 | 未开始 |

## 旧路径（迁移完成后删除）

已确认可由 M1 取代：

- `runtime/StripPlacement.ts`
- `parts/architecture/ProfilePlacementAlgorithms.ts` 中的 `placeStripSupport`
- `parts/architecture/BuildingGenerators.ts` 中的 `buildWallStrip`，`European.ts` 中的 `buildEuropeanWall`、`buildEuropeanFence`
- `parts/architecture/BuildingPublication.ts`、`BuildingProfileSupports.ts` 中的 `wallStrip` 分支

预计由 M2–M5 取代，迁到对应阶段时逐个确认后补进上面的列表：

- `parts/architecture/` 的设计与编排：`BuildingDraft`、`BuildingDesign`、`BuildingDesignRules`、`BuildingDesignIdentity`、`BuildingGenerators`、`BuildingImplementation`、`BuildingPublication`、`BuildingProfileSupports`、`ProfilePlacementAlgorithms`、`BuildingExecution`、`European`、`Steps`
- `parts/algorithms/`、`parts/BuildingAlgorithms.ts`
- `runtime/` 中的连接与开洞编排：`WallConnectionPipeline`、`ProfileContacts`、`ProfileDecorations` 等

保留：`runtime/` 中的渲染、打包、shader、LOD。数值内核迁为构件类型层的铺设算法，或者连接规则。

## 兼容代码（与旧路径一起删除）

| 位置 | 内容 | 为什么存在 |
| --- | --- | --- |
| `application/CoreEuropean.ts` | 调用线上的参数规范化函数 | 得到相同的 Float32 舍入 |
| 同上 | `MORTAR_LIMIT = 0.2` | 线上 `insetMaterialSpan` 限制灰缝不超过跨度的 1/5 |
| 同上 | `SLIVER = 0.001` 作为 `range` 下限 | 线上会保留极窄的碎砖 |
| 同上 | binding、owner 调色板、geometry 记录 | 线上放置文档和调色板槽的形状 |
| 同上 | 单元 id（`a/row-0/0`、`rail-i/j`）、按行号计算的 `anchor_uv`、横栏排序 | 线上的单元命名和绘制顺序 |
| 同上 | 栅栏的两个构件合成一个绘制组 | 线上一个绘制组同时画立柱和横栏 |
| `render/CoreRenderInput.ts` | 整个适配器，以及其中的类型强转 | 目标是线上的 `BuildingRenderInput`；迁移后铺设单元直接交给单元渲染器 |
| `render/CoreHouseRender.ts` | 强调石的种子映射到 0–9，普通砖不小于 10 | 线上砖块 shader 用“种子小于 10”表示强调石；新架构用单元参数 `accent` 表达，迁移到新的单元渲染器后改为显式参数 |
| `render/CoreHouseRender.ts` | 房屋先整体调用线上管线，再替换墙砖和矩形坡屋顶的瓦片、脊瓦、封边瓦；圆形屋顶、远景屋顶材质、预览、背衬、调色板、装饰仍是线上的 | 这些构件类型还没迁移 |
| `render/CoreHouseRender.ts` | 屋顶记录写成线上的 `roof-design-v1`，单元种子写进记录的序号字段，单元的 `anchor_uv` 填 0 | 线上屋顶 shader 和重力动画读这个格式；迁移到新的单元渲染器后由单元参数直接驱动 |
| `application/CoreEuropean.ts` | 圆形屋顶和平屋顶保留一个 `houseRoof` 占位构件 | 它们还由线上屋顶渲染 |
| `tests/core/CoreHouse.spec.ts` | `gridCourses` 与线上 `arrangedWallCells` 逐值对比 | 验证规则网格墙的迁移 |
| `world/demos/building-core-preview/house.html` | M2 房屋验收页 | 并排展示线上房屋与新架构房屋 |
| `tests/core/CoreParity.spec.ts` | 与线上路径实时对比，`-0` 统一成 `+0` | 线上写 `-s`，`s = 0` 时得到 `-0` |
| `world/demos/building-core-preview/` | M1 验收页 | 并排展示两条路径 |

## 已定的渲染方向

- 铺设算法分为布局（`plan`）和按槽位展开（`unitAt`）。CPU 只保留布局。
- GPU 用 TransformFeedback（只支持 WebGL2）按槽位生成单元记录。记录留在显存里，正式运行不读回。原型：`render/GridUnitKernel.ts`，以及 `world/demos/building-core-preview/` 下的 `gpu.html`、`draw.html`。
- LOD 保留在 CPU 上。在 seed-world 初始村子（约 1 万个单元）上实测，CPU 的 LOD 选择每帧约 0.15–0.23 ms。WebGL2 不能在 GPU 上压缩绘制列表，LOD 搬到 GPU 会使顶点工作量增加约 8 倍。GPU 路径用 `unitAt` 为 LOD 提供每个单元的中心和半径，每个单元 16 字节，不保留完整记录。测量页：`frame.html`。

## 屋顶模型

- 每个坡面一个构件（类型 `roof`），只 attach 到它下面的那面墙：坡面 k 在墙 k 上。坡面几何是 `roofSlope` 曲面：u 横跨一行瓦，v 按弧长沿坡面向上。
- 相邻坡面共用一条侧边时是斜脊：join 规则 `roofSlopes` 派生 `hipCap` 构件，并给两个坡面各加一个 `clip` 修改，把瓦片切在斜脊线内 0.075 m。
- 两个坡面的顶边相对时是正脊：同一条规则派生 `ridgeCap` 构件。
- 坡面几何用 `rakes` 声明哪条侧边在山墙上：attach 规则 `roofOnWalls` 为这条边派生 `rakeCap` 构件，并沿这条边裁剪瓦片。
- 瓦片和脊瓦用不同的单元原型。两者的 `range` 都按 648 种屋顶的实测伸缩范围设定；瓦片的厚度不伸缩。
- 铺设算法：`roofTiles`（瓦行，第一行下面加檐口封边瓦）、`capCourses`（沿线铺脊瓦，接缝位置用各自的种子）。
- 这套规则以后也用来处理 L 形屋顶和相交屋顶的天沟。
- 与线上对比（`tests/core` 临时对比、`house.html`）：瓦片朝向一致，尺寸比约 1.0，包围盒一致；瓦行按坡面实际弧长均分，所以和线上相差几厘米；檐口封边瓦数量随瓦长随机，和线上不同。

## 要替换的还原算法

- 墙体原生砌筑（`generateMasonry` 以及 `Recovered*` 墙体内核）来自 Tiny Glade 的二进制还原。我们会用自己的 `masonryCourses` 替代它：同样做转角加随机砖行，随机数用核心层的种子通道，每块砖可以按槽位单独计算。
- 替代的标准是观感相近，不要求逐字节一致。
- 屋顶还原内核（`RecoveredRectangularRoof`、`RecoveredRoofPlacement` 中的矩形部分、`RecoveredRoofMath`）已由 `partTypes/Roof.ts` 取代矩形坡屋顶，删除前还要迁移圆形屋顶和远景屋顶材质（`RecoveredRoofContext`）。
- 顺序：
  1. M2 先包装原生砌筑，和线上对比；
  2. 看效果；
  3. 实现 `masonryCourses`；
  4. 在验收页并排对比两者；
  5. 删除还原的墙体内核。

## 未完成项（不是兼容，要补实现）

- 内置 `surfaceGrid` 的 `trim` 只按曲面边界截短，遇到洞口时整块丢弃。`masonryCourses` 已经能绕开删除区域（把砖切成上、下、左、右几块），转角石就是这样实现的；通用的 `surfaceGrid` 还没有这个能力，到 M4、M5 再补。
- 引用元素：依附构件的几何引用宿主元素，继承宿主的修改记录。抹灰需要。
- 有效曲面的“到边界距离”查询。抹灰边缘侵蚀需要。
- 删除区域作为裁剪区域交给渲染（`clip` 平面已经交给渲染）。
- 圆形屋顶（塔楼的锥形屋顶）、平屋顶、屋顶开洞（老虎窗）、尖顶。
- 屋顶单元的 `anchor_uv`：线上用屋顶曲面投影，远景材质可能用到。
