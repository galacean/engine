# Seed World / Integrated World Water 差异报告

日期：2026-08-19
对比对象：Seed World `seed=1729` 与当前 Integrated World Grasslands Heightfield Water

## 结论

Seed World 的 Heightfield 湿地已经使用 Integrated World 的同一套 Water Grasslands Look、材质、光学、反射采样、High Quality Plan、法线资源和昼夜反射 Profile。运行时验证也确认：

- SSR 开启时 Camera 管线处于 `Force On`，Water 使用 `ssr-over-environment`，Seed 水体注册了 48 个透明 SSR receiver draw。
- SSR 关闭时 Camera 管线处于 `Force Off`，SSR Render Target 被释放；Water 从 SSR 回退到 Environment/Probe，最后才使用 Analytic fallback。
- 折射处于启用状态，Scene Color、Scene Depth 和 `refraction-depth-validity` 均已解析；`Refraction amount` Debug View 能显示水面折射贡献。

因此，“关闭全局 SSR 后水仍有反射”不是开关失效。Integrated World 的反射策略是 `SSR -> Environment/Probe -> Analytic`，全局 SSR 开关只控制屏幕空间反射，不是总反射开关。Seed 与 Integrated 在这一点上行为一致。

本次修复不修改任何 Integrated World 水材质数值。Seed 改为直接引用 Integrated World 已导出的 SSR Camera request，并补齐真实材质、折射、反射来源和 SSR 消费 readback，避免继续用 Host 可用性推断实际材质状态。

## 完全一致的配置

| 类别 | Seed World | Integrated World | 结果 |
| --- | --- | --- | --- |
| Backend | `heightfield` | `heightfield` | 一致 |
| Body kind | `lake` | `lake` | 一致 |
| Representation | `bounded-grid / heightfield` | `bounded-grid / heightfield` | 一致 |
| Look | `grasslands-water-look-v1` | `grasslands-water-look-v1` | 一致 |
| Quality Plan | `grasslands-terrain-high-v2` | `grasslands-terrain-high-v2` | 一致 |
| Geometry / Surface | `high / high` | `high / high` | 一致 |
| Scene fields | `scene-color-depth` | `scene-color-depth` | 一致 |
| Reflection / Query | `ssr / dense` | `ssr / dense` | 一致 |
| Composition | `PrecomposedReplace` | `PrecomposedReplace` | 一致 |
| Depth write | `true` | `true` | 一致 |
| Render queue / blend / cull | `transparent / alpha / off` | `transparent / alpha / off` | 一致 |
| Render priority | `20` | `20` | 一致 |
| Normal resource | Grasslands normal asset/hash | 同一 asset/hash | 一致 |
| Appearance gates | external normal、depth tint、coastal alpha、contact foam、direct specular 全开 | 全开 | 一致 |
| Environment fallback | HDR Probe | HDR Probe | 一致 |
| Submission | `4 ms`，上传后释放 Mesh CPU Data | 相同 | 一致 |
| Water layer | Layer 30 | Layer 30 | 一致 |

### 材质

两者都直接引用 `GRASSLANDS_TERRAIN_WATER_MATERIAL_CONFIG`：

| 参数 | 值 |
| --- | --- |
| Shallow / Deep color（Linear） | `[0.0386867910, 0.1784838411, 0.2632734085, 1]` |
| Foam color | `[1, 1, 1, 1]` |
| Opacity | `1` |
| Shore foam width | `12 m` |
| Foam intensity | `0` |
| Micro normal strength | `0` |
| Wave strength | `0` |

`foamIntensity`、`microNormalStrength` 和 `waveStrength` 为零是设计值：可见细节由严格 Grasslands Surface Appearance V2 提供，不使用旧版程序化泡沫/法线/波浪叠加。

### Surface Appearance V2 与折射

两者都使用 `grasslands-stylized-water-surface-v2`：

| 参数 | 值 |
| --- | --- |
| Primary color closure | `LitSceneColorDepthRamp` |
| Detail normal layers | 2 层镜像世界空间法线 |
| Normal scale | `[0.05, 0.05]` |
| Normal velocity | `[0.02, 0.02]` |
| Normal strength | `0.2` |
| Depth response | Scene Ray Depth，`10 m`，Power `0.5` |
| Coastal alpha | Scene Ray Depth，`1.5 m` |
| Contact foam | Obstacle Contact，`0.1791 m`，Voronoi |
| Refraction enabled | `true` |
| Refraction UV scale | `0.1` |
| Refraction normal source | `tangent-space` |
| Refraction validation | `shifted-scene-depth` |

### 光学与反射

| 参数 | 日间 / authored | 夜间 Profile |
| --- | ---: | ---: |
| IOR | `1.333` | `1.333` |
| Fresnel F0 | `0.0203731878` | `0.0203731878` |
| Surface optical distance | `4 m` | `4 m` |
| Refraction strength | `0.05` | `0.05` |
| Roughness | `0.18` | `0.05` |
| Reflection intensity | `0.85` | `1.23` |
| Environment fallback intensity | `1` | `4` |

反射采样也完全一致：Environment `1`、distortion `0.2`、最大扰动 `32 px`、边缘淡出 `23 texels`、粗糙度 footprint `3`、High filter `1 sample`。

### Camera SSR

Seed 现在直接使用 Integrated World 的 `TERRAIN_WATER_SSR_CAMERA_SETTINGS`，不再维护数值副本：

| 参数 | 值 |
| --- | ---: |
| Receiver mode | Transparent Sample Only |
| Quality | High |
| Trace resolution scale | `0.5` |
| Max ray distance | `128 m` |
| Thickness floor | `0.01 m` |
| Max roughness | `0.7` |
| Edge fade | `0.06` |
| Composite intensity | `1` |

## 有意保留的几何与页面差异

这些差异来自两种世界的数据，不应为了材质一致而强行复制 Integrated World 的固定湖泊：

| 项目 | Seed World `1729` | Integrated World | 影响 |
| --- | --- | --- | --- |
| Source kind | `grid-mask` | `terrain-region` | 只改变权威水域来源 |
| Component policy | 保留海洋和全部断开湿地 | `largest` | Seed 有 5 个连通分量，Integrated 有 1 个 |
| 水位 | `0.04 m`（0 m datum + 表面偏移） | `12.2 m` | 世界布局差异 |
| Grid | `512 x 512` | `512 x 512` | 一致 |
| Cell size | `6 x 6 m` | `3.6177486 x 3.6177486 m` | Seed 远景折射/岸线变化更粗 |
| Chunks | `48` | `10` | Seed 水域更分散 |
| 最大 bathymetry | 约 `121 m` | 约 `8 m` | Seed 深水更快被吸收/散射染色覆盖 |
| Query routing | 开启 | 固定湖泊实例关闭 gameplay query | Seed 用于雨滴和水面命中 |
| Body / Asset ID | Seed 专用稳定 ID | Grasslands 固定 ID | 生命周期身份差异 |
| 页面默认时刻 | `10:00` 日间 | `00:00` 夜间 | 同一昼夜 Profile 会解析出不同反射强度 |
| 默认视角 | 约 4.3 km 俯视全世界 | 近水面 Walk/Water 视角 | Seed 默认视角会显著压缩折射位移和 SSR 视差 |

Seed 当前 River Water 仍按本期约定临时关闭；本报告与修复只针对 Heightfield 湿地。

## SSR 开关与折射的运行时证据

### Seed SSR On

- Pipeline：Active / Force On / supported。
- Consumer lease：1。
- Trace Render Target：Camera 尺寸的 `0.5x`，输入和最终 resolve 保持全分辨率。
- Receiver：opaque 10，transparent 48。
- Water：effective source `SSR`，miss fallback `Environment/Probe`。

### Seed SSR Off

- Pipeline：Off / Force Off / supported。
- Inactive reason：`disabled-by-global-switch`。
- Render Target：0，资源已释放。
- Receiver draws：opaque 0，transparent 0。
- Water：requested `SSR`，effective source 为 `Environment/Probe`，fallback reason 为 `ssr-unavailable`。

同一画面快速切换所得 Canvas 像素并不相同；约 46,986 个 BMP 通道字节发生变化，平均变化量约 7.22。视觉差异较小是因为 Environment/Probe fallback 仍然提供完整反射，不是 SSR 状态未传播。

### Seed Refraction

- `refractionEnabled = true`。
- Scene Color、Scene Ray Depth、Refraction Depth Validity 均解析到 Camera provider。
- Water DevTools 中 Refraction 开关为 On，IOR `1.333`、Surface distance `4`、strength `0.05`。
- `Refraction amount` Debug View 在 Seed 水面输出非空结果。

默认俯视视角、`6 m` Cell、最高约 `121 m` 水深和线性色彩吸收会让最终画面中的折射不如 Integrated World 近水面浅湖明显，但材质与折射链路没有缺失。

## 本次代码修复与防回归

- Seed 删除本地 SSR Camera 数值副本，直接复用 `TERRAIN_WATER_SSR_CAMERA_SETTINGS`。
- Seed 的 Heightfield Appearance gates 直接复用 Water 默认只读配置；Composition 与 Depth Write 直接复用 Grasslands Controller presentation。
- Seed diagnostics 新增实际材质 readback：strict material、Appearance/hash、法线 hash、折射开关/强度、Fresnel、粗糙度、反射强度、请求/实际反射来源、回退原因、SSR 消费和 Camera feature 状态。
- 回归测试锁定共享 Material、Optical Profile、Surface Appearance V2、Reflection Sampling、Appearance gates 和 SSR request 的复用关系。
- 未修改 Integrated World 的任何水材质参数。
