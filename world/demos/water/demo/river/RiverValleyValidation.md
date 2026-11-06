> 2026-10-05 契约更新：Water 网格床高查询现统一双线性，河谷仍保留原顶点和显示三角形。非共面单元内部的三角面与双线性床面有离散表现误差；以下有关“三角形插值”的旧验证是历史快照，不作为当前 CPU 床高契约。当前公共采样、实际深度及浏览器验证见 [LakeTerrainIntegration](../../../../shared/water/authoring/lake/LakeTerrainIntegration.md) 与 [规划实施记录](../../../terrain/seed-world-planner/V2_IMPLEMENTATION.md)。

# River Valley 场景适配验收

本页按批次保留历史证据。当前展示为文末「沿河地形带裁切」版本；前面的完整河谷模型、草和资源计数，以及 Unity 对照截图均是裁切前记录。

验收日期：2026-09-13。代码位于基准提交 `955d59721` 之上的未提交工作树；本批未执行 commit 或 push。

河谷主体、资产导出、独立 Look、交互和 River 生命周期验证通过。Ocean 浏览器冒烟通过；Lake 浏览器回归未通过，详见最后一节。因此不将共享消费者的完整回归标为全部通过。

## 参考与可复现导出

- 原项目：`/Users/xingyi/Documents/github_code/stylized-water-2-demo`，SW2 v1.7.0，Unity 2021.3.45f1 / URP 12.1.15。
- 原场景：`Assets/StylizedWater2/_Demo/RiverDemo.unity`。导出脚本只修改一次性副本；原项目 Assets、Packages、ProjectSettings 的 555 个文件前后 SHA-256 一致。
- 完整重复导出得到相同 manifest 和 payload 校验和。资产版本：`100c3d9de2d69b9d2cc6a0631fbc44bafcadf96e6074bbe4815a21243e974e98`。
- 30 个河道截面、水平长度约 135.646 m、落差约 23.692 m；六处逆坡修正记录在 manifest，最大下调 0.3818 m。
- 91 个原场景模型实例；原生 257×257 地形高度、混合权重、512×512 草密度和 Noon HDR 天空。39,681 丛草按原密度区域确定性放置；原场景没有额外有效 LOD 层级。
- 重建步骤及素材边界见 [SOURCE.md](../../assets/valley/SOURCE.md)。不在运行时加载 Unity 序列化对象。

## 固定画面条件

截图目录：`/Users/xingyi/Documents/Codex/2026-09-12/river-valley`。
本地对照页：`http://127.0.0.1:4203/validation/`；默认预览：`http://127.0.0.1:4203/#showcase-river`。

两端画幅为 1280×720。Galacean 冻结 surfaceTime=0；Unity 参考克隆原水材质并令 `_Speed=0`，避免编辑器全局时间继续输运水纹。每个机位保留完整 Unity 效果及关闭 VFX、焦散、独立 Lake 的范围对照；全效果图中的粒子状态不作为逐帧匹配条件。

| 机位 | Galacean 位置 → 目标（米，右手坐标） | FOV | Galacean / Unity 范围对照 / Unity 完整图 |
| --- | --- | --- | --- |
| 主展示 | (-29.71,18.12,-50.27) → (4,2.8,-82) | 38.3° | `galacean-overview.png` / `reference-reexport/overview.png` / `reference-reexport/original-full.png` |
| 上游陡降 | (3,24,-63) → (26,15,-81) | 45° | `galacean-upstream.png` / `reference-reexport/upstream.png` / `reference-reexport/upstream-full.png` |
| 岩岸跌水 | (-26,12,-55) → (0,6,-75) | 45° | `galacean-cascade.png` / `reference-reexport/cascade.png` / `reference-reexport/cascade-full.png` |
| 下游弯道 | (-57,7,-32) → (-37,-0.5,-62) | 48° | `galacean-downstream.png` / `reference-reexport/downstream.png` / `reference-reexport/downstream-full.png` |

四机位能对应原岩壁、两段陡降、河道转弯和植被分组。水面使用 River 编译器重新生成，不渲染原 Unity 水网格。外围地形与查询裁切区域共享原生网格和三角形插值，不隐式挖河床。

## 固定 Look

Look ID：`stylized-river-valley-high-v1`，与原 River High 的作者数据、反射策略及编辑状态独立。

| 参数 | 值 |
| --- | --- |
| 吸收 / 米 | (0.65, 0.025, 0.015) |
| 散射 / 米 | (0.02, 0.12, 0.16) |
| 浅水 / 深水色调 | (0.06, 0.95, 0.87) / (0.02, 0.27, 0.37) |
| PhaseG / IOR | 0 / 1.333 |
| 折射 / 粗糙度 | 0.3 / 0.28 |
| 法线 / 反射 / 泡沫强度 | 0.467 / 1 / 0.7 |
| 反射策略 | SSR → environment → analytic |

可见天空和环境反射使用同一份原 Noon HDR 资源。适配曝光 0.33、对比度 -19.7、色温 12、饱和度 8；Bloom 强度 1、阈值 0.177。保留现有 High 的物理透射和流动坐标，因此颜色、泡沫形态并非原 Shader 的像素级复刻。

## 实测结果

| 验收项 | 结果与证据 |
| --- | --- |
| 地形与水深 | 87 个跨段中心线采样点通过；覆盖上游、两段陡降、平缓段、下游。查询床高等于完整可见地形插值，水深等于水面减床高；无 NaN 或负水深。运行时探针 (-28,-71)：水面 -0.102810 m、河床 -0.783574 m、水深 0.680764 m。 |
| 版本 | 默认 River source hash `853208aa7da3fe48`，terrain hash `bacdd0db90bb52fc`、revision 1。 |
| 低角度与分量 | 保存俯视、2°/5°/15°、关闭泡沫/SSR/折射，以及透射、散射、SSR 有效性、泡沫来源图。检查主机位及低角度画面，未观察到原先孤立黑斑或整片白色遮盖；保留正常岩岸阴影。 |
| 环境光 GPU 负对照 | 修复共享水面模块只读 CPU SH、遗漏实时 IBL SH 的问题。关闭太阳光并把 CPU 环境色设零，实际 GPU 散射图与零散射系数对照有 138,727 个变化像素，最大通道差 40/255。不是仅凭环境提供者状态判定。 |
| 外观与 JSON | 增量编辑、有效 JSON 往返、非法导入保留有效配置通过；外观更新不改变地形 hash 或物理编译次数。Valley / 原 High Look 及反射策略互不串状态。 |
| 实际面板与移动 | 内置浏览器修改粗糙度并恢复默认，冻结时间通过。持续 keydown 跨动画帧后 WASD/QE 相机移动有效；相同事件在输入框聚焦时不移动相机。使用跨帧事件是为了避免自动化瞬时按键在单帧内完成。 |
| 场景事务 | 快速排队更新、取消、移除/重建水体通过；迟到结果不覆盖最终选择。原 editing / calibration / bend / pools / bridge 五种场景均发布一个有效水体。 |
| 十次进出 | 暖机后十次 bend↔valley 的存活资源均为 mesh 221、material 62、Texture2D 75、TextureCube 12、RenderTarget 36；活动河谷实例保持 1。计数证明该序列未持续增长，不代表 GPU 耗时或移动端性能。 |
| 加载失败 | 单独测试页三次令 scenery GLB 返回 503，均保留旧 bend 场景和 source hash；暖机后每次计数一致（22/45/55/6/30）。恢复 fetch 后可重新进入 valley，页面说明也恢复正常。 |
| 最终 River 运行日志 | 新载入后的 95 个响应中无失败请求，无新控制台警告/错误，WebGL `getError()` 为 0。故障注入页独立关闭，不混入正常日志。 |

证据文件：`export-validation.json`、`browser-validation.json`（八组通过）、`load-failure-validation.json`、`ui-validation.json`、`shared-consumer-validation.json`。
浏览器自动化入口为 [verify-river-valley.js](../../scripts/verify-river-valley.js) 的 `verifyRiverValley()`，通过现有 `window.riverDemo` 操作；截图读取实际 WebGL canvas。保存证据时可提供本地 `/_evidence/` POST 接收器。

## 工程验证与回归边界

- Water 类型检查、River 生产构建、Ocean 生产构建通过。构建仅有既有大 chunk 提示。
- 受影响的十个测试文件合计 201 项：首次 198 通过、3 项旧河流控制点索引断言失败；将断言改为查找 z=0 的实际中心控制点后，相关三文件 17/17 通过。其余已通过测试未重复执行。没有为适配旧断言改动生产河流几何。
- Ocean 在内置浏览器显示环岛与近岸机位，WebGL 错误为 0；保存 `regression-ocean.png`。
- **Lake 浏览器回归未通过**：两次初始化均出现 `Unexpected token 3` 和 `Grasslands Showcase bootstrap failed closed`，请求未失败。当前工作树同时存在独立 Lake 水下界面的变更；本批未修改或回退这些文件，也尚未隔离错误来源。Lake 外观兼容性不能据此宣告通过。

## 明确保留的差异

水花粒子、局部薄雾、水底焦散和独立下游 Lake 未实现。原 LUT 以现有调色近似；FXAA 与 Unity SMAA 不同。草的逐株随机位置、根部顶点色遮蔽及整体植物轻微摆动是 Galacean 适配，并非 Unity 草/风 Shader 的完整移植。水体继续使用 High 单次散射和相机级 SSR，未引入专属反射相机或独立 ray march。

## 泡沫分布调整（2026-09-13）

先前的功能验收不代表泡沫分布已达到美术目标。固定相机和时间、关闭泡沫对照后，确认缓坡上的大片白色来自坡面泡沫触发过早和纹理叠加饱和。

- River High 坡面触发范围由 rise/run 0.005～0.08 调整为 0.08～0.45，缓坡不再快速达到满强度。
- 两层泡沫纹理由相加截断改为平均，按线性贴图范围 0.15～0.4 形成破碎遮罩；岸边包络平方衰减，减轻向河道内部扩散。
- Valley 泡沫强度由 1.1 调整为 0.7。改动只进入 River 单次散射分支；旧 River 分支及 Lake/Ocean Shader 不变。
- 类型检查、生产构建通过；四文件 37 项测试通过，最终阈值调整后重新执行 River 材质 13 项测试通过。
- 内置浏览器检查主展示、下游及 2°/5°/15° 机位；开关泡沫有实际 GPU 差异，调参不改变地形 hash 或物理编译次数。五个原 River 场景均就绪、bodyCount=1。无新增控制台警告、错误或失败请求，WebGL 错误为 0。
- 固定帧前后对照：证据目录中的 `foam-before-{overview,downstream,sources}.png` 与 `foam-after-{overview,downstream,sources}.png`，同为 1508×1618、surfaceTime=0。浏览器结果为 `foam-validation.json`。这些新图对应调整后的 0.7 预设；前面的 Unity 四机位对照仍记录初次适配的 1.1 版本。

## 沿河地形带裁切（2026-09-13）

按展示河流的范围精简场景：地形沿原中心线与逐点宽度，向两岸各外扩 10 m；植物及草只保留岸外 8 m 内。与河流或岸外 2 m 接触的岩石、岩壁保留完整模型，避免截断模型；其外轮廓可能超过地形带。远处布景从导出 GLB 中移除。

| 内容 | 裁切前 | 当前 |
| --- | --- | --- |
| 地形顶面单元 | 65,536 | 5,068 |
| 模型实例 | 91 | 36 |
| 草丛 | 39,681 | 1,881 |
| scenery.glb | 20,657,476 字节 | 4,146,844 字节 |

- 地形采用紧凑顶点与原生单元索引，外缘和底部增加 3 m 厚的封闭展示截面。顶面高度、三角形插值和原 30 个水面截面均不改动；原完整高度数组保留为参考数据，不再全部生成显示网格。原 1 m 网格的阶梯状外轮廓仍然可见。
- Manifest 版本 2、content hash `eca4b8a33d22262b9830b63cee5dcc11fbe12583a2498e47056e9c25334f3b3e`。复用已校验的 Unity 原始导出重复打包，两次 manifest 完全相同；原购买项目 555 个文件校验和仍与原始记录一致。
- Water 类型检查、最终生产构建通过；RiverValley、RiverTerrainSnapshot、RiverHighDemo 三文件 22 项测试通过。覆盖裁切后无未使用顶点、原始三角形对应、封边拓扑、非法单元输入，以及 87 个中心线采样点仍位于显示地形内且查询同源。
- 最终生产构建在 Codex 内置浏览器验证四个原机位、俯视与 2° 低角度。保存 `corridor-after-{overview,upstream,cascade,downstream,top,low2}.png`，1508×1618、surfaceTime=0；裁切前图为 `corridor-before-{overview,top}.png`。`corridor-wide.png` 使用 FOV 60°、位置 (-12,155,-66)、目标 (-12,0,-66.01)，用于查看裁切轮廓。
- 外观调整、JSON 往返后 terrain hash 和物理编译次数不变；恢复默认为泡沫强度 0.7。River source hash 仍为 `853208aa7da3fe48`、terrain hash 仍为 `bacdd0db90bb52fc`。探针 (-28,-71) 水深仍为 0.680764 m。
- 暖机后十次 bend↔valley 的资源数每次均为 mesh 71、material 63、Texture2D 75、TextureCube 12、RenderTarget 36，活动河谷实例保持 1；新增一个复用的截面材质。WebGL 错误为 0，最终页面未观察到新增控制台警告、错误或失败请求。这些结果不用于推断帧率提升。
- 证据：`corridor-export-validation.json`、`corridor-browser-validation.json`。本批没有修改共享 Shader、Lake/Ocean 或其他河流场景配置，未重新执行其完整画面回归；也未提交代码。
