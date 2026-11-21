# SSR v2 Authoring & Pipeline Contract

Galacean SSR v2 是原生内置渲染特性，面向移动端内存与带宽预算设计，无历史兼容层，配置统一收敛到 Scene、Camera 和 Material。

## 公共 API

| 层级 | API | 默认值 / 语义 |
| --- | --- | --- |
| Scene | `scene.screenSpaceReflection` (`ScreenSpaceReflectionSettings`) | `enabled = false`, `quality = Medium`, `intensity = 1.0`, `maxRoughness = 0.6`, `maxDistance = 25`, `thickness = 0.15`, `edgeFade = 0.1`, `temporalBlend = 0.85` |
| Camera | `camera.enableScreenSpaceReflection` | `boolean`，默认 `true`（仅在 `override ?? scene.screenSpaceReflection` 为有效开启态时生效） |
| Camera | `camera.screenSpaceReflectionOverride` | `ScreenSpaceReflectionSettings \| null`，默认 `null`（跟随 Scene） |
| Camera | `camera.notifyScreenSpaceReflectionCut()` | 相机切换 / 瞬移时清除历史颜色与时域缓存 |
| Camera | `camera.screenSpaceReflectionDiagnostics` | 只读 `SSRDiagnostics`（状态机、分辨率、接收数、Stencil/Packed 标识、字节估算） |
| Material | `material.screenSpaceReflectionIntensity` | `Material` 默认 `0`，`PBRMaterial` 默认 `1.0`；`0` 退出 Receiver 与 Forward SSR 采样 |
| Material | `material.contributeScreenSpaceReflectionDepth` | 默认 `false`；透明材质开启后仅非零 Alpha 写入独立 `SSRContributionDepth` 以供 Hi-Z 命中 |

## 质量档位预算

| 档位 | Trace 分辨率 | Hi-Z 最大步数 | 时域稳定 | 重建采样 |
| --- | --- | --- | --- | --- |
| `Low` | `0.35x` | `16` | 无（不申请 Ping-Pong / slot 1） | 双线性直接采样（有透明接收时做深度校验） |
| `Medium` | `0.5x` | `24` | 表面重投影 + 3×3 方差 Clamp + 接收深度校验 | 双线性直接采样（有透明接收时做深度校验） |
| `High` | `0.5x` | `32` | 虚像-表面混合重投影 + 前后帧法线/深度校验 | Forward 内 2×2 双边重建（深度 + 法线） |

## 渲染与着色器契约

- **每像素最近接收面（Closest-Wins）**：Pre-Forward `SSRReceiver` 在统一非 MSAA `Depth24Stencil8` 附件上先以 `DepthWrite = false` 绘制不透明 / AlphaTest 合格接收面，再以 `DepthWrite = true` 绘制透明接收面；后层被前层覆盖时在 Forward 自动回退 IBL。
- **零 WebGL2 反馈回路**：`Depth24Stencil8` 仅挂载于深度测试/硬件 Stencil 剔除，绝不在同一 DrawCall 中作为采样纹理读取；Hi-Z 与上一帧线性颜色金字塔采用独立同尺池化 Scratch + `CopyTexture` 逐级构建。
- **线性空间直采**：Forward PBR（`LightIndirectPBR.glsl`）在环境漫反射/高光之后、Tonemapping 之前直接调用 `evaluateScreenSpaceReflection` 按金属度/Fresnel/清漆主瓣替换 `envRadiance`。
- **纹理单元降级保护**：`RenderQueue` 在 Forward 阶段检查材质实际 Active Texture Units；超出 `maxFragmentTextureUnits` 时优先降级关闭 `CAMERA_SSR_BILATERAL_SAMPLE`，仍超限时回退标准 IBL。
- **序列化字段**：Scene 保存 `screenSpaceReflection` 字段；Camera 保存 `enableScreenSpaceReflection` 与可选 `screenSpaceReflectionOverride`；Material 保存 `screenSpaceReflectionIntensity` 与 `contributeScreenSpaceReflectionDepth`。
