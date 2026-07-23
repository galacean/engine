Water Optics P0 为 Heightfield/Pool 提供可验收的水下折射，以及 Sky、真实 Cube Probe、Planar 三路水面反射。它运行在 `world-gallery` 内部，不修改 `packages/core`，也还不是从 `@galacean/engine` 导出的公共包能力。

## 固定能力边界

| 能力                     | Medium                             | High                               |
| ------------------------ | ---------------------------------- | ---------------------------------- |
| Scene Color / Depth 折射 | 1 次 opaque copy + 1 次 depth copy | 1 次 opaque copy + 1 次 depth copy |
| Probe                    | 真实 `TextureCube`                 | 真实 `TextureCube`                 |
| Planar                   | 1/4 视口、单次 bilinear            | 1/2 视口、可选 5-tap cross         |
| Planar owner             | 每相机最多 1 个                    | 每相机最多 1 个                    |
| 合成                     | 单主水面 `precomposed-replace`     | 单主水面 `precomposed-replace`     |

`Experimental` 入口在 P2 特性关闭时解析为 High 等价行为。P0 不包含 SSR、Temporal history、Waterline/Caustics 或 Dedicated Composite。

## 帧内数据流

```text
CameraWaterFeatureBroker
  -> 合并所有 consumer 的 CopyDepth / CopyColor 请求
  -> 每相机最多一次 depth copy、一次 opaque copy

WaterReflectionService
  -> Sky / Probe / Planar 策略与回退
  -> 单 Planar Camera + RenderTarget
  -> WaterReflectionBinding

HeightfieldWaterRuntimeController
  -> WaterOpticalProfile
  -> refraction / composition / debug 状态
  -> reflection texture、VP、尺寸和采样参数
  -> Heightfield shader
```

水层固定排除在 Planar Camera 的 culling mask 外，避免反射相机再次渲染水面形成递归。资源缺失、尺寸非法或 Planar 渲染失败时，binding 会清空旧 texture/VP，再显式回退 Probe 或 Sky；不能继续保留已销毁的 RT 引用。

## 折射如何工作

Medium/High 在片元中读取 centered opaque sample `B` 与微法线位移后的 sample `D`。位移由屏幕空间法线差、质量档 UV scale、`WaterOpticalProfile.refractionStrength` 和光学深度共同控制。采样还必须依次通过：

- 屏幕边界 clamp；
- displaced depth continuity；
- 被采样几何位于水面之后；
- 片元级 shoreline signed-distance gate；
- Beer-Lambert transmittance 与 foam suppression。

Lab 还提供一个固定在主 Pool 左侧的世界空间矩形 Local Foam Mask。Mask On 时，该区域既进入可见泡沫着色，也会把同片元的最终折射权重乘以 `1 - localFoamMask`；Mask Off 时两条路径同时关闭。因此它不是只改 HUD 或颜色的假开关，可通过 `refraction-amount` 做聚焦 A/B。

岸线 gate 必须按片元 local-map SDF 计算。若使用大三角形顶点的插值 shore damping，顶点都在边界时会错误地把整片水面的最终折射权重压成零。

调试视图可分别观察：

```text
centered-opaque-color / displaced-opaque-color
refraction-uv-delta / optical-depth
depth-continuity / sample-validity
refraction-amount / refraction-gates
fresnel / shader-composited-color / surface-alpha
```

`refraction-gates` 的 R/G/B 分别是 depth、shore 与 Beer-Lambert transmission gate。调试输出强制 alpha 为 1，避免再被透明混合污染。

当前折射只承诺 Opaque Texture 中的水下不透明物。透明鱼、玻璃、粒子不在 opaque copy 内，不能宣称已经支持。

## 为什么 Lab 默认使用 precomposed

Shader 已经读取背景并生成目标色 `C`。若继续用 legacy alpha 把 `C` 与 framebuffer destination 再混合，就可能重复引入背景。

P0 Golden Scene 固定采集 `B / D / C / A / F`，并同时测试：

1. `legacy-alpha`；
2. `precomposed-replace + Blend Off`；
3. DepthWrite Off / On 独立 A/B。

当前 Chromium 证据显示 legacy `F` 显著偏离 `C`；`precomposed-replace` 在 DepthWrite Off/On 下均与 `C` 的内部水面 ROI 完全匹配。因此 Water Optics Lab 默认使用 precomposed，而通用 Heightfield runtime 为兼容已有调用仍保留 legacy 默认值。

precomposed 只承诺单主水面 Pool/Lake。多水面排序、普通透明物排序和真正独立的 Water Mask/Composite 仍属于 P2 RFC，不应把 Transparent priority 原型描述为 Dedicated Composite。

## 反射来源与质量

- `sky`：解析天空近似，始终作为最终兜底。
- `probe`：采样调用方注入的真实 Cube Texture；Lab 使用 6 个不对称、确定性、`CC0/generated` 的 RGBA8 线性面。
- `planar`：镜像主相机，并使用归一化平面、oblique clip、一次 RT Y flip、边缘/clip-W/距离/观察角 fade。

Medium 固定一次 bilinear。High 的交互式 Lab 默认使用 5-tap cross，roughness 控制 footprint；正式 Golden 与性能 Gate 会显式锁定历史 1-tap 配置，保持证据可比。所有 Planar UV 都限制在半 texel 有效区间，非法投影回退解析 Sky，不能产生越界黑边。

Golden Scene 还有一个只被 Planar Camera 看见的水下洋红哨兵。主相机通过独立 layer 排除它，Planar Camera 仍能渲染它；因此关闭 oblique clip 会在固定 ROI 暴露洋红，重新开启后必须完全消失。正式阈值是 clip-off 覆盖率至少 5%、clip-on 不超过 0.5%。这个开关只用于验证投影裁剪，产品路径默认且始终保持开启。

## Water Optics Lab

面向公开学习和 A/B，分别打开 `#feature-refraction` 与 `#feature-reflection`；它们只保留当前主题需要的控制与证据。下面的 `#water-optics-lab` 属于默认隐藏的 Developer 案例，用于 Golden、跨水体矩阵、Planar owner 和生命周期验收。

启动 Gallery 后打开：

```text
http://127.0.0.1:4179/demos/water-pcg/#water-optics-lab
```

无 query 的交互式页面默认使用当前已实现的最高效果：`High + Planar + 5 Tap + Refraction On + Precomposed + Planar Clip On`。`DepthWrite` 保持 Off 以维持更安全的透明排序；`Experimental` 仍解析为 High 回退，不作为更高画质入口。需要复现 Medium 固定验收场景时使用 `?waterOptics=medium&reflection=sky&stats=0#water-optics-lab`。

浏览器验收 API：

```js
window.waterPcgOptics.setRefractionEnabled(true);
window.waterPcgOptics.setReflectionSource("planar");
window.waterPcgOptics.setCompositionMode("precomposed");
window.waterPcgOptics.setDepthWriteEnabled(false);
window.waterPcgOptics.setPlanarClipEnabled(true); // 仅验证用；产品默认始终开启
window.waterPcgOptics.setReflectionMode("auto"); // River -> Probe，其余当前 Lab body -> Planar
await window.waterPcgOptics.setWaterBody("multi"); // pool / river / ocean / multi
window.waterPcgOptics.setLocalFoamMaskEnabled(true);
window.waterPcgOptics.setReflectorMovementEnabled(true);
window.waterPcgOptics.setReflectorTime(12.5); // 冻结水面下也可做两个确定性位置的 causal A/B
window.waterPcgOptics.setCameraMovementEnabled(true);
window.waterPcgOptics.setFreeCameraEnabled(true);
window.waterPcgOptics.cameraCut();
window.waterPcgOptics.setPlanarOrientationMarkersVisible(true);
window.waterPcgOptics.getPlanarOrientationExpectedPoints(); // left/right/up/down CPU mirror reference
window.waterPcgOptics.setDebugView("sample-validity");
window.waterPcgOptics.metrics;
```

Lab 默认仍使用固定验收机位。`Auto Camera` 在当前 Camera Preset 周围执行确定性的缓慢运动；`Free Camera` 则挂载 Demo 层的 `@galacean/engine-toolkit-controls/FreeControl`：

- 按住鼠标左键拖动可改变观察方向；
- `W/A/S/D` 或方向键沿当前相机方向移动；
- 默认移动速度为 5 m/s，相比原 2 m/s 提升 2.5 倍；
- 自由相机关闭地面锁定，因此可以进入任意高度，也可以冻结水面后继续移动观察；
- Free 与 Auto 互斥；选择 Camera Preset、Water Body、场景 Preset 或执行 Camera Cut 会退出 Free 并恢复固定机位；
- 自由模式每帧先更新 source Camera，再更新 Planar reflection，避免反射使用上一帧相机姿态；
- 关闭 Free 时销毁控制组件；下次开启重新创建，以当前固定姿态初始化朝向，避免首次拖动跳视角。

正式截图和性能采集保持固定机位。`screenshot=1` 默认不开启 Free Camera；正式性能采集检测到 Free Camera 开启时会直接拒绝执行。

场景中的 `moving-reflector-boat` 是实际不透明几何，冻结时固定采样 `surfaceTime=12.5`，解冻且开启 Move Reflector 后沿水边运动。上下左右四个色块使用固定且非对称的 id、位置和颜色，并可统一显隐；另有仅镜像 Camera 可见的 lime anchor。`lifecycle-stress` preset 会进入真实的 P1 cross-body 模式，而不是 inactive 占位。

UI 保留 Auto/Sky/Probe/Planar，Auto 必须先解析成明确来源。SSR 与 Dedicated 按钮保持 disabled，调用对应 API 也会抛出 P2 Core RFC 提示，不能把它们记录为已实现。`planar-too-close`、`planar-underwater` 与 `planar-back-facing` 是仅验收用 Camera preset，用于稳定触发同名显式 fallback。

Debug 面板按 Quality、Time & Motion、Camera、Test Scene、Reflection、Refraction & Composite、Planar、Diagnostics 分区；运行时指标独立位于 Runtime Readback。宽屏采用双列实验台布局，窄屏自动切成单列，所有既有 `data-optics-*` 与 `data-metric` 自动化契约保持不变。

正式截图固定 `1280 × 720`、DPR 1、`surfaceTime=12.5`、`stats=0`。P0 脚本会在启动 Chromium 前直接读取本地 `roi.json` 与 PNG，校验 schema、精确文件名、冻结阈值和 SHA-256，再把校验后的本地字节作为 `data:` URL 交给页面；不会从 `WATER_OPTICS_URL` 获取 baseline。缺失或哈希错误会直接失败。`WATER_OPTICS_P0_BASELINE_ROOT` 仅用于指定隔离的本地诊断副本；脚本没有自动更新模式，每次运行只写入 `world-gallery/output/playwright/`。

## Stats 与正式性能证据

`@galacean/engine-toolkit-stats` 直接作为 `Script` 挂到 source Camera entity；不需要继承 Stats，也不修改 Engine 内核。`stats=1` 只用于人工 HUD，且必须只有一个 `.gl-perf` 面板。

正式性能采样强制 `stats=0`，使用同页 `OFF -> ON -> OFF`：每阶段默认预热 2 秒、至少 300 帧且采样不少于 5 秒。`refraction-only` 固定 Sky fallback 且要求 Planar Camera/RT/bytes 为 0；`refraction-plus-planar` 额外要求单个 Planar Camera/RT、非零 Planar bytes，以及独立的 `frame-envelope` 与 `planar-pass` timer scopes。schema-v4 报告分别记录场景身份、Engine texture/buffer memory、Water camera/probe/planar bytes 和正式 Gate 汇总。没有 GPU timer 时写 `incomplete / unavailable / null` 并返回非零退出码，绝不能伪造为 0 ms 或通过。

## 自动验收

```sh
pnpm -C world-gallery typecheck:water-pcg
pnpm -C world-gallery test:water-pcg
node world-gallery/demos/water-pcg/e2e/water-optics-p0-smoke.mjs
node world-gallery/demos/water-pcg/e2e/water-optics-p0-visual.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=medium WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-only node world-gallery/demos/water-pcg/e2e/water-optics-performance.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=medium WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-plus-planar node world-gallery/demos/water-pcg/e2e/water-optics-performance.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=high WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-only node world-gallery/demos/water-pcg/e2e/water-optics-performance.mjs
WATER_OPTICS_HEADED=1 WATER_OPTICS_PERF_TIER=high WATER_OPTICS_PERF_PRESET=cross-body-optics WATER_OPTICS_PERF_SCENARIO=refraction-plus-planar node world-gallery/demos/water-pcg/e2e/water-optics-performance.mjs
```

视觉 Gate 覆盖 Refraction On/Off、前景栏杆、水面四边连续 60 帧 sentinel、Probe/Sky、Planar owner/RT/锚点、clip-off/on 洋红覆盖率，以及 B/D/C/A/F 与 precomposed DepthWrite A/B。浏览器 console、page error、请求失败和 WebGL compile/link/API 错误都直接失败。

P1 Lab 已让 River、Ocean 与 Heightfield 消费统一 `WaterSurfaceOpticsBinding`，并提供 `cross-body-optics`、双水位 Pool + River 的 `multi-water-arbitration` 与 `lifecycle-stress`。这只代表本地 Demo/自动化契约；Safari、iOS 与 Android 的设备矩阵仍需各设备证据，不能由桌面 Chromium 结果替代。
