# SSR v2 Authoring & Pipeline Contract

Galacean SSR v2 是原生内置渲染特性，面向移动端内存与带宽预算设计，无历史兼容层，配置统一收敛到 Scene、Camera 和 Material。

## 公共 API

| 层级 | API | 默认值 / 语义 |
| --- | --- | --- |
| Scene | `scene.screenSpaceReflection` (`ScreenSpaceReflectionSettings`) | `enabled = false`, `quality = Medium`, `intensity = 1.0`, `maxRoughness = 0.6`, `maxDistance = 25`, `thickness = 0.15`, `edgeFade = 0.1`, `temporalBlend = 0.85`, `useLinearTrace = false` |
| Camera | `camera.enableScreenSpaceReflection` | `boolean`，默认 `true`（仅在 `override ?? scene.screenSpaceReflection` 为有效开启态时生效） |
| Camera | `camera.screenSpaceReflectionOverride` | `ScreenSpaceReflectionSettings \| null`，默认 `null`（跟随 Scene） |
| Camera | `camera.notifyScreenSpaceReflectionCut()` | 相机切换 / 瞬移时清除历史颜色与时域缓存 |
| Camera | `camera.screenSpaceReflectionDiagnostics` | 只读 `SSRDiagnostics`（状态机、分辨率、接收数、Stencil/Packed/LinearTrace 标识、字节估算） |
| Material | `material.screenSpaceReflectionIntensity` | `Material` 默认 `0`，`PBRMaterial` 默认 `1.0`；`0` 退出 Receiver 与 Forward SSR 采样 |
| Material | `material.contributeScreenSpaceReflectionDepth` | 默认 `false`；透明材质开启后仅非零 Alpha 写入独立 `SSRContributionDepth` 以供追踪命中 |
| Material | `material.screenSpaceReflectionBilateral` | 默认 `true`；High 档关闭时该材质在 Forward 退回 2-tap 深度校验采样 |
| Material | `material.screenSpaceReflectionOccluder` | 默认 `true`；在无共享 `DepthOnlyPass` 的 fallback `DepthOnly` 中控制不透明/AlphaTest 物件是否写入 SSR 遮挡深度 |

## 质量档位预算

> `useLinearTrace = true` 时（默认 `false`）跳过 Hi-Z mip 1..N 构建，直接在 mip 0 上执行线性追踪以减少 mipmap 开销；可通过 Scene 或 Camera override 动态切换。

| 档位 | Trace 分辨率 | 最大追踪步数 | 时域稳定 | 缓冲格式与重建采样 |
| --- | --- | --- | --- | --- |
| `Low` | `0.25x`（长边上限 `960px`） | `12` | 无（不申请 Ping-Pong / slot 1） | `RGBA8 + Oct8 + Reinhard HDR`（`4B/px`）；双线性直接采样（有透明接收时做深度校验） |
| `Medium` | `0.5x`（长边上限 `960px`） | `28` | 表面重投影 + 5-tap 方差 Clamp + 接收深度校验 | `RGBA8 + Oct8 + Reinhard HDR`（`4B/px`，`recvNR` 复用 ping-pong 槽）；双线性直接采样（有透明接收时做深度校验） |
| `High` | `0.5x`（长边上限 `960px`） | `28` | 虚像-表面混合重投影 + 3×3 方差 Clamp + 前后帧法线/深度校验 | `RGBA16F`（能力受限时回退 Packed）；Forward 内 2×2 双边重建（深度 + 法线） |
| `XHigh` | `1.0x`（全分辨率 ColorPyramid 与 Trace） | `64` | 虚像-表面混合重投影 + 3×3 方差 Clamp + 前后帧法线/深度校验 | `RGBA16F`（能力受限时回退 Packed）；Forward 内 1:1 直接采样 |

## 渲染与着色器契约

- **每像素最近接收面（Closest-Wins）**：Pre-Forward `SSRReceiver` 在统一非 MSAA `Depth24Stencil8` 附件上，不透明 / AlphaTest（仅当不透明接收面数量 > 0 时渲染）与透明接收面均以 `DepthWrite = true`、`CompareFunction = LessEqual` 绘制；并按可见 Receiver 包围盒与历史脏区并集计算紧致 `scissorRect`（近裁剪面跨接时保守扩展）减少清屏与像素着色；被遮挡或越界的区域在 Forward 自动回退 IBL。
- **零 WebGL2 反馈回路与持久历史复用**：`Depth24Stencil8` 仅挂载于深度测试/硬件 Stencil 剔除，绝不在同一 DrawCall 中作为采样纹理读取；Hi-Z 深度采用持久化双槽 ping-pong（`hiZTex[0/1]`）避免每帧全屏深度拷贝，具备全分辨率深度附件时通过合并 Pass（`DownsampleAndBuildHiZMip0`）写入 mip 0，再用 `_setMipLevelRange` 原地构建后续 mip 链（不支持时退回 Scratch + Copy）；上一帧线性颜色金字塔优先使用 `generateMipmaps()`。
- **线性空间直采与 Packed HDR**：Forward PBR（`LightIndirectPBR.glsl`）在环境漫反射/高光之后、Tonemapping 之前直接调用 `evaluateScreenSpaceReflection`（自定义材质也可调用 `sampleScreenSpaceReflectionRaw` / `sampleScreenSpaceReflectionRawWithDepth`）；Low/Medium HDR 将预乘辐射度编码到 `RGBA8`（`SSR_PACKED_HDR_REINHARD`）以保持高光范围并避免低置信度边缘放大。
- **纹理单元降级保护**：`SSRForwardProgramResolver`（由 `RenderQueue` 在 Forward 阶段调用）检查材质实际 Active Texture Units；超出 `maxFragmentTextureUnits` 时优先降级关闭 `CAMERA_SSR_BILATERAL_SAMPLE`，仍超限时回退标准 IBL。
- **序列化字段**：Scene 保存 `screenSpaceReflection`（含 `enabled`、`quality`、`intensity`、`maxRoughness`、`maxDistance`、`thickness`、`edgeFade`、`temporalBlend`、`useLinearTrace`）；Camera 保存 `enableScreenSpaceReflection` 与可选 `screenSpaceReflectionOverride`；Material 保存 `screenSpaceReflectionIntensity`、`contributeScreenSpaceReflectionDepth`、`screenSpaceReflectionBilateral` 与 `screenSpaceReflectionOccluder`。
