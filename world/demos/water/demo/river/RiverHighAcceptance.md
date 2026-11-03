# River High 水面实现与验收

**通过。F1—F7 全部通过本批约定的桌面 WebGL2、水面上方验收。** 最终生产构建完成 13 组自动验收、16 组固定视角截图与连续相机移动检查。

## 2026-09-10 Review 修复复验

本轮仅收敛 Demo 的参数更新、校验、默认值来源和场景组织，未修改水面 Shader。

- 增量外观更新在串行队列执行时合并最新状态；连续设置粗糙度与 PhaseG 均保留，同一字段最后一次生效。提交参数使用独立副本，调用方后续修改数组不会影响排队中的更新。完整 JSON 导入维持替换语义。
- `reflection` 只接受三个字符串枚举；数组、对象、null 等非法 JSON 不改变上一份外观或固定帧画面。
- 默认值从已注册的 authoring Look 快照读取，移除 Demo 的重复默认常量；面板恢复使用初始快照。编辑色调时保留未编辑的散射深度系数。
- 场景仅保留标定、弯道、浅滩深池和桥岸。测试物体只放桥岸；深池改为直线等宽。切换成功后采用对应初始机位，保留 Look；原有 JSON 字段及调试 API 名称兼容。

验证：Water 类型检查通过；4 个针对性测试文件 / 27 个测试通过；生产构建通过；生产浏览器共 15 组检查通过，包括本轮连续更新/四场景交互与原有 F1—F7 回归。控制台/WebGL 错误与失败响应均为 0。12 次生命周期的存活 GPU 对象计数稳定（texture 25、buffer 42、program 15、framebuffer 13、renderbuffer 4）。

- [本轮生产浏览器运行证据](/Users/xingyi/Documents/Codex/2026-09-10/river-review-fixes-112153/result.json)
- [弯道](/Users/xingyi/Documents/Codex/2026-09-10/river-review-fixes-112153/review-bend.png) · [浅滩深池](/Users/xingyi/Documents/Codex/2026-09-10/river-review-fixes-112153/review-pools.png) · [桥岸](/Users/xingyi/Documents/Codex/2026-09-10/river-review-fixes-112153/review-bridge.png)
- [针对性测试日志](/Users/xingyi/Documents/Codex/2026-09-10/river-review-fixes-112153/river-review-tests.log)

以下基线、预设和数值记录来自首轮 High 实现验收；本轮运行的 Source hash、地形版本、相机与时间以以上 result.json 为准。

## 范围与源码基线

- Galacean 需求基线：`c244da1d1`，分支 `xingyi/water-development`。验收时 HEAD 为 `ec5a86d417df`（并行 Lake 工作的提交），叠加本批 River 工作区变更。没有替换或回滚该 Lake 提交。
- UE 参考：本地 Unreal Engine **5.8.2 / `16d75d847`**，根目录 `/Users/xingyi/Documents/github_code/UE/UnrealEngine`。
- 实现源文件位于 `world/gallery/demos/water`；没有改动 Engine Overlay、外层 `packages/` 或并行开发的 Lake/SeedWorld 功能。
- 仅覆盖水面上方的 High River；未扩展水下后处理、焦散、动态尾迹、流体模拟和移动端性能档位。

| UE 源码 | 本批采用的机制 | 适配差异 |
| --- | --- | --- |
| `Engine/Shaders/Private/SingleLayerWaterShading.ush:45`，`EvaluateWaterVolumeLighting` | RGB 消光、单次散射、视线透射和后方场景到水面的独立衰减 | 参数统一为米，浅深色盘只调制散射贡献；通过共享水面 closure 合成 |
| `Engine/Shaders/Private/SingleLayerWaterCommon.ush:115`，`SampleSceneDepthWithoutWaterBilateral` | 深度约束采样、前景拒绝、同权重颜色/深度归一化 | WebGL2 显式四邻域采样；无效样本回退中心；屏幕边缘按纹素渐退 |
| `Engine/Shaders/Private/SingleLayerWaterComposite.usf:218` | 预乘 SSR 覆盖环境反射，随后应用 BRDF | 复用相机 SSR 的透明接收者；水材质只采样，避免相机再合成一次 |
| `Engine/Source/Runtime/Renderer/Private/SingleLayerWaterRendering.cpp:1853`，`RenderSingleLayerWater` | 无水背景准备、水面着色和反射资源顺序 | 保留 Forward，不引入 Deferred GBuffer、tile classification、间接绘制或 River 反射相机 |
| `Engine/Shaders/Private/ParticipatingMediaCommon.ush:113`，`SchlickPhase` | `k=1.55g−0.55g³`，`(1−k²)/(4π(1+k cosθ)²)` | UE 多项式在 `|g|≈0.95` 时会略超出 `|k|=1`；本实现额外限制 `k∈[-0.99,0.99]`，避免负散射和极点 |

静态泡沫、局部流向与河道坐标仍由 River 适配层负责，没有把这些风格化效果归因于 UE 的体积积分。

## 功能与实现位置

| 编号 | 实现 | 关键文件 |
| --- | --- | --- |
| F1 | 真实床深、场景 eye depth 和折射后视线光程分离；选样后重建光程 | `shaders/river/RiverRefraction.glsl`、`ForwardPass.glsl`、`demo/river/RiverDemoSceneSource.ts` |
| F2 | 可选 `surfaceScattering` RGB 每米系数、PhaseG；CPU/GPU 同一物理表达式 | `authoring/optics/WaterSurfaceScattering.ts`、`runtime/optics/WaterSurfaceOpticsMath.ts`、`shaders/library/surface/WaterSurfaceSingleScattering.glsl` |
| F3 | 独立新版 Look，PhysicalVolume + 散射色盘；背景透射一次、覆盖率合成一次 | `authoring/river/RiverHighLook.ts`、`shaders/library/surface/WaterSurfaceClosure.glsl` |
| F4 | IOR 折射位移、薄水/岸边抑制、纹素边界渐退、颜色/深度一致的有效权重 | `shaders/river/RiverRefraction.glsl`、`ForwardPass.glsl` |
| F5 | 共用六面天空、SSR→环境→解析；主方向光阴影只压低直接贡献 | `demo/river/RiverDemoEnvironment.ts`、`runtime/river/RiverWaterBackend.ts`、`runtime/surface/WaterSurfaceRendererContract.ts` |
| F6 | Forward/SSR 共用几何、局部流向、纹理法线与时间；岸边/坡面/静态接触泡沫 | `shaders/river/ScreenSpaceReflectionSurface.glsl`、`ForwardPass.glsl`、`demo/river/RiverDemoSceneSource.ts` |
| F7 | Look 事务更新、完整 JSON 校验/保存/恢复、时间冻结、GPU 诊断与显式资源释放 | `demo/river/RiverDemoLook.ts`、`RiverDemoLookPanel.ts`、`runtime/resources/destroyWaterOwnedMesh.ts` |

本次验收发现并修复了几处已有路径问题：Look 更新清空反射绑定而生命周期跳过重绑；空附加法线层覆盖了 River 流动法线；泡沫开关未覆盖岸边信号；程序网格销毁后 buffer 依赖全局 GC；固定的旧 Fresnel F0 被新版 Look 继承。新的默认行为由回归验证，旧 Look 不自动迁移。

## 固定预设

新版 ID：`stylized-river-high-single-scattering-v1`。所有 RGB 均为线性值。

| 参数 | 值 |
| --- | --- |
| 吸收 RGB / m | `[0.8, 0.11, 0.045]` |
| 散射 RGB / m | `[0.04, 0.2, 0.28]` |
| PhaseG | `0`，可编辑范围 `[-0.95, 0.95]` |
| 浅色 / 深色 | `[0.1, 1, 0.98]` / `[0.03, 0.34, 0.65]` |
| 散射色盘深度系数 / m | `0.3` |
| IOR / Fresnel | `1.333` / 由 IOR 推导 F0 |
| 折射强度 / 粗糙度 | `1` / `0.28` |
| 反射策略 / 强度 | `ssr → environment → analytic` / `1` |
| 法线强度 | `0.15` |
| 泡沫 | 开启，强度 `0.65` |
| 直接高光 | 开启 |

旧光学字段仍用于兼容旧消费者；启用新配置后不再把旧标量散射或经验 Alpha 叠加到新水面。

## Demo 与诊断

入口保持 `#showcase-river`。场景仅保留标定河槽、弯道、浅滩深池、桥岸遮挡；重复的平缓河槽已删除。标定河槽水位 `0.5 m`，三个河床高程 `0.25/-0.5/-2.5 m`，对应 `0.25/1/3 m` 水深。RGB 水下标记只放在这个平直标定场景；桥、桥墩、半浸石头与反射立柱仅位于桥岸场景。弯道只改变中心线和宽度，浅滩深池使用直线等宽河槽以突出水深变化。

- 视角：总览、水底近景、桥岸、垂直标定、2°/5°/15° 低角度；支持 WASD/QE 与拖动观察。
- 所有 Look 调整走 authoring 事务；不改 Source、地形 revision 或物理编译结果。
- JSON 支持复制、下载、导入，版本为 `1`，预设标识为 `river-high`。非法字段/范围/格式会保留上一有效配置。
- GPU 深度/光程视图以 **4 m 对应白色**；T/S 直接显示 Shader 分量。T/S 数值验收使用线性化读回；显示 gamma 与水体积分分别处理。
- 泡沫来源视图：R=岸边、G=几何坡面、B=静态障碍。平水面没有坡面泡沫；可见桥墩/石头与障碍输入共用数据，高架桥面不作为接触泡沫输入。
- 默认关闭的诊断面板可观察实际光程、透射、散射、折射有效性、法线、SSR 有效性/辐亮度及方向光阴影。

`window.riverDemo` 保留场景、查询与相机接口，新增 `setDebugView(mode)`、`setSurfaceTime(seconds | undefined)`、`exportLook()`、`importLook(json)`；另提供环境开关、光照标定、相机 pose 和屏幕投影用于验收。没有恢复已删除的旧 River 全局调试 API。

## 验收结果

验收日期：2026-09-10（Asia/Shanghai）。浏览器 Chromium / ANGLE Metal，实测 GPU 为 Apple M5 Pro；视口 `1280×800`、DPR `1`，窗口调整覆盖 `1000×700`。固定截图使用水面时间 `0 s`；零流速比较 `0/9 s`，有流速比较 `0/2 s`。

| 编号 | 结论 | 实测证据 |
| --- | --- | --- |
| F1 | 通过 | 标定查询为 `0.25/1/3 m`；GPU 1 m 深度读回 `1.000633 m`；移动相机后物理查询完全相同，GPU 光程增加 |
| F2 | 通过 | CPU 独立公式阈值 `1e-5`；GPU 模块覆盖 `d=0/0.25/1/3 m` 的 T/S；Demo 透射最大绝对误差 `0.002876943`，小于 `2/255`；PhaseG 正负及 ±0.95 均通过 |
| F3 | 通过 | 零消光、IOR=1、关闭泡沫/高光/反射时，与中心背景最大字节差为 `0`；标定浅滩可辨棋盘/RGB 标记，深池颜色更浓 |
| F4 | 通过 | IOR=1 和折射强度=0 均无位移；无效采样回退中心像素差 `0`；有效区域仍有折射，窗口调整与岸边观察无 WebGL 错误 |
| F5 | 通过 | SSR 对 RGB 物体的命中像素分别 `[4984, 318, 3328]`；转离物体后 `91541` 个有效水面上的未命中样本与环境反射差为 `0`；关闭 SSR/移除环境的回退通过；桥影、环境散射和粗糙度响应通过 |
| F6 | 通过 | 零流速固定帧法线 hash 一致，有流速 hash 改变；平水面坡面/障碍泡沫为零；岸边与静态障碍诊断分别检测到 `1732/3068` 个信号像素；2°/5°/15° 及总览未见翻面造成的孤立黑块 |
| F7 | 通过 | Look 更新与 JSON 往返不改变 Source hash、地形版本和物理编译次数；非法导入保留状态及固定帧；真实面板、下载、WASD 焦点保护通过；连续 12 次创建/销毁资源不增长 |

暖机后每次循环的存活 GPU 对象一致：`{"texture": 25, "buffer": 42, "program": 15, "shader": 0, "framebuffer": 13, "renderbuffer": 4}`。这一计数来自 WebGL 创建/删除 API 的实际观测，不是预设预算。

完整 Water 单测 **132 个文件 / 973 个测试通过**；最终受影响测试补跑 **41 个通过**；共享 SSR 契约测试 **8 个通过**；Water 类型检查通过；更新后的 River smoke 通过重入与切换。生产构建成功，有现有 chunk 体积提示。最终 River 浏览器记录 **0 控制台错误、0 失败请求、0 WebGL 错误**。

Lake / Ocean 已运行生产构建的兼容验收，均无页面/WebGL 错误。Ocean 额外操作近岸/远海机位。Lake 使用当前并行开发后的场景，仅判断共享着色兼容，不把其新场景变化计为本批 River 成果。旧光学配置和旧 Look 保持兼容的数值/材质断言也已通过。

最终固定截图的场景身份：

| 场景 | Source hash | 地形 revision |
| --- | --- | --- |
| calibration | `f5cd68fd9a89cdac` | 10 |
| bend | `a0d59753c1a75bc6` | 11 |
| pools | `e48aa0f15b754e73` | 12 |
| bridge | `23c912fa8ea5c067` | 13 |

总览相机 `[25,24,32] → [0,0,0]`；标定相机 `[0,65,0.01] → [0,0.5,0]`；桥岸 `[0,4,13] → [0,0.3,-9]`。低角度相机统一为 `[0,0.5+30×tan(θ),22] → [0,0.5,-8]`，θ 为 2°、5°、15°。主方向光旋转 `[-48,-35,0]`，线性 RGB `[1.5,1.425,1.29]`；六面天空与环境反射共享纹理、sRGB 解释和曝光 1。

交付目录：`/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647`。其中包含完整结果 JSON、所有关键截图、导出的 Look、测试日志及逐文件 SHA-256 manifest。

- [逐项运行证据](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/river/result.json)
- [实际默认外观 JSON](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/river/river-high-look.json)
- [源码与生产文件 manifest](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/manifest.json)
- [弯道总览](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/river/bend-overview.png)
- [标定浅深水](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/river/calibration-overview.png)
- [2° 低角度](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/river/bridge-low2.png)
- [SSR 实际 RGB 命中](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/river/ssr-rgb-hits.png)
- [静态泡沫来源](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/river/foam-sources.png)
- [Lake/Ocean 兼容证据](/Users/xingyi/Documents/Codex/2026-09-10/river-high-acceptance-013647/compatibility/result.json)


## 复现

从仓库根目录运行。`run-engine.mjs` 入口会串行同步 Gallery，不要并发运行多个同步入口。

```bash
node world/scripts/run-engine.mjs pnpm --dir world-gallery exec tsc --noEmit -p tsconfig.water.json
node world/scripts/run-engine.mjs pnpm --dir world-gallery exec vitest run --config vitest.config.ts demos/water/tests
node world/scripts/run-engine.mjs pnpm --dir world-gallery exec vite build demos/water --config vite.config.js --outDir /tmp/river-high-dist --emptyOutDir --target esnext
python3 -m http.server 4182 --bind 127.0.0.1 --directory /tmp/river-high-dist
```

在另一个终端运行：

```bash
node world/.materialized/engine/world-gallery/demos/water/e2e/river-high-acceptance.mjs
WATER_URL=http://127.0.0.1:4182/ WATER_SHOWCASE_CASE_IDS=showcase-river node world/.materialized/engine/world-gallery/demos/water/e2e/water-showcase-smoke.mjs
```

验收脚本默认输出 `/tmp/river-high-acceptance`；可通过 `RIVER_HIGH_URL`、`RIVER_HIGH_OUTPUT` 修改地址/输出目录。脚本在生产页面内读取实际 GPU 结果，并用生产光学模块的独立 1×1 GPU 核验覆盖零光程；CPU 探针只用于物理水深对照。

本段为原验收记录。2026-09-10 测试精简后，共享兼容入口已删除，Ocean / Lake / River 基础检查统一为 `e2e/water-showcase-smoke.mjs`。Ocean 使用其独立 `ocean/index.html` 生产构建，默认地址 `4183`。Lake 沿用旧的静态相对路径，验证生产目录需同时复制 `demo/grasslands/assets` 到相同相对位置；本次未更改 Lake 的资产加载或功能代码。

`destroyWaterOwnedMesh` 仅用于本批独立拥有 buffer 的程序网格，不能用于导入或共享 buffer 的 mesh。它局部访问 Engine 的索引 buffer 绑定并显式释放，避免通过全局 GC 影响其他消费者。生命周期验收记录的是实测存活 GPU 对象数，不据此宣称移动端性能或 GPU 时间收益。
