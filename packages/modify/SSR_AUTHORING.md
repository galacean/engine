# SSR 作者配置与透明贡献

SSR 核心实现通过 `native-overrides.json` 整文件替换原生 Engine；水体接入位于 `packages/water`。本地实现覆盖 Scene / Camera / Material 作者配置、运行解析、预览临时开关和透明贡献，Editor 通过公共事务保存配置。正式设备性能标定暂未完成。

## 作者接口

| 位置 | API / 持久字段 | 语义 |
| --- | --- | --- |
| Scene | `scene.screenSpaceReflection.apply(data)`、字段 setter、`toJSON()` | 场景默认作者配置 |
| Camera | `camera.screenSpaceReflectionSettings = { settingsSource, overrideSettings }` | 完整快照恢复；来源为 UseSceneSettings / Override |
| Material | `material.screenSpaceReflection = { mode, intensity }` | Auto / Off / On 接收意图，独立于 Shader 参数 |
| Material | `material.contributeScreenSpaceReflection` | 是否贡献透明颜色和深度，默认 false，与接收独立 |
| 预设 | `applyPerformancePreset(quality)` | 只写六个性能字段，档位名称不保存 |

Camera 默认跟随所属 Scene。首次 Override 复制当前 Scene 作者参数；切回跟随时保留独立值。完整快照省略 `overrideSettings` 会恢复“从未初始化独立设置”；Partial override 以当前 Scene 为基线。增量修改使用 `applySettings()`。直接写 Camera SSR 作者字段会选择 Override，其 getter 返回保留的独立值。临时覆盖相机应保存、恢复完整快照。

SceneLoader 在构造相机前应用 Scene SSR。Scene 变化和相机跨 Scene 移动在渲染准备时解析，不依赖 Editor 轮询。运行时 `new Scene()` 和缺字段旧资产保持 Auto、ExplicitOnly、全分辨率、GaussianBilateral、最大距离 20；Editor 新场景模板显式保存 Auto、StandardPbrAuto 和 Medium。

Auto 使用有效 consumer 请求的整组参数。ForceOn 使用作者的相机级参数，但 scoped consumer 继续控制对应接收阶段的追踪参数；ForceOff 压住渲染但保留 lease 和阶段预算。六字段预设来自 Engine `getQualityPreset()`，仅包含 resolutionScale、upsamplingMode、maxRaySteps、thickness、maxRayDistance、hitRefinementSteps，不改变视觉字段、模式或内容选择。

材质作者数据是不可变快照，未配置时 getter 返回 `null`，Editor 应显示“沿用运行时”，保存/回写 null 不接管运行状态。缺少作者字段的旧材质保留 `setMaterialReceiver()` 运行注册能力；显式设置作者值后，运行 API 返回 false，避免覆盖作者意图。清除作者配置恢复原运行状态。队列、Shader 和不兼容效果变化会重新解析，但不清除作者值或强度。`getMaterialReceiverMode()` / `isMaterialReceiver()` 纯读当前能力；作者 setter 和渲染准备负责写入派生 Uniform。

## Shader 契约与透明贡献

- Surface 几何附件保持 RGBA8：RG 是世界空间法线的 oct8 编码，B 是粗糙度，A 是响应权重；响应颜色使用独立附件，其可选格式扩展见下文。所有 Surface 生产者必须传入最终世界空间法线，Trace、Upsample 和 Composite 解码后再转到视空间。ReceiverNormal Debug 仍显示视空间法线颜色。
- 固定的世界空间法线不会因相机旋转跨越量化档；这不消除 oct8 的静态角误差（世界向上法线约 0.226°），也不提高动态波浪、法线贴图或物体旋转造成的真实法线变化精度。真实法线仍会跨量化档，未增加时域纹理或改变显存预算。水体原有面向视线的法线翻面规则保留。
- 接收 Surface 声明 `screenSpaceReflectionReceiver = "ColorResponseV3"`，明确 RG 使用世界空间 oct8。旧视空间 `ColorResponseV2` 资产仍可加载并执行 Forward，但接收能力检查会拒绝它，显式注册、作者 On 和 Auto 均不会执行其 Surface/Trace；需重建 Shader 后才能重新接收 SSR。
- 透明接收还需 Forward 声明 `screenSpaceReflectionTransparentSample = "SampleV1"`，并实际采样 SSR。普通 PBR 不支持透明接收；River / Heightfield 支持。
- 不透明及 Alpha Test PBR 支持 Clear Coat。内置 Surface 额外声明 `screenSpaceReflectionClearCoat = "SingleLayerV1"`；自定义 V3 Surface 未声明此能力时仍拒绝清漆，原有无清漆 V3 合同不变。Anisotropy、Iridescence、Transmission 及与清漆的混合组合仍不支持；独立 Sheen 的基础层接收合同见下文。
- Clear Coat 保持两个 Surface MRT、每接收阶段一次 Trace 和原有全屏 Composite；几何附件仍为 RGBA8，响应附件按下述显式扩展选择格式。Surface 使用 Forward 相同的贴图、独立法线及法线抗锯齿后的粗糙度，按反射响应和追踪粗糙度置信度选择较强的可接收层。清漆响应包含其强度及 AO，基础层响应包含清漆衰减；只替换所选层的环境反射，另一层保留 Forward IBL，不在两层间复用射线。
- 选层评分接近时，修正量在相对评分差 0 到 0.1 之间平滑衰减到零，切换处回退到原 IBL。此内部过渡避免独立法线硬切换造成的跳变，但可能形成反射减弱的窄带，尚需复杂内容标定。清漆强度或贴图值为零时回到基础层，两层分别服从当前接收阶段 Max Roughness；Surface 的阶段输入不改写 Water 的公开采样合同。雾仅衰减反射修正量。
- 选层置信度采用可选扩展 `screenSpaceReflectionSourceConfidence = "SignedAlphaV1"`，与 `SingleLayerV1` 分开声明。仅启用 Clear Coat 的变体输出 `response.a = -1 - selectionConfidence`；RGB 保存未乘选层置信度的所选 BRDF 响应，仍包含材质强度、AO 和雾。非负 Alpha 继续遵循旧 V3 的接收权重合同，Trace 对这类源始终使用置信度 1；普通 PBR、Water 和旧自定义 V3 不需修改。旧自定义 Clear Coat 仍须 `SingleLayerV1`，需要淡出源传播时再显式采用此扩展，不能只把淡出混入 RGB。
- 可见的不透明/Alpha Test 接收者采用此扩展时，现有响应附件由 RGBA8 改为 Point 采样的 RGBA16F；内置 RGB 输出显式保持原 RGBA8 量化，Alpha 在 [-2,-1] 存储独立置信度（约 1/1024 精度）。不新增 RT、附件数量、Draw、Trace 或材质 Resolve；额外显存为全输出尺寸的 `4 * width * height` 字节（1920×1080 约 7.91 MiB），与 Trace 分辨率无关。场景移除这类接收者或 Clear Coat=0 后恢复双 RGBA8。旧自定义 V3 与清漆共享此附件时，Half Float 舍入可能使临近 RGBA8 量化边界的 RGB 出现至多 1 LSB 差异，权重语义保持不变。没有可渲染/可采样 Half Float 时，仅这类清漆接收者不接收 SSR 并保留 Forward IBL，报告 `unsupported-screen-space-reflection-source-confidence-format`；普通 V3 继续原路径。
- Trace 使用 `C_source * C_hit` 同时预乘 RGB/Alpha，然后三种模式均对这一信号重建。GaussianBilateral 恢复固定归一化的四次线性采样核，不按 BRDF 或材质响应重新归一化，因此成组源共同淡出不会约掉选层置信度。相较上轮七 texel 加 Origin/Response 查询，删除这些额外查询；仅使用扩展的不透明接收阶段，Trace 在最终选中的 origin 增加一次响应 Alpha 查询；普通 PBR 和 Water 独立运行时不启用该采样。
- Composite 对采用扩展的接收像素仅执行有界衰减：`trace *= C_receiver / max(C_receiver, trace.a, EPSILON)`，然后按原 BRDF/材质强度/AO/雾计算修正量。等价于把重建后的修正置信度限制在接收者置信度以内；同一均匀置信度在 Trace 已乘一次，不再平方。比例始终不超过 1，不反预乘恢复辐射，也不放大小 Alpha 噪声。旧 V3 的非负 Alpha 和 geometry.a 仍按原接收权重乘法处理。
- 不透明及 Alpha Test PBR 可单独启用 Sheen，并仅由基础层接收 SSR。活动 SubShader 的所有 Surface 须声明 `screenSpaceReflectionSheen = "BaseLayerV1"`；只声明 V3 的旧自定义 Shader 仍拒绝 Sheen。Surface 复用 Forward 的贴图和 `bsdfData.sheenScaling`，将该衰减乘入基础层 BRDF 响应一次；绒面光泽自身保留 Forward 计算，不加入 SSR 响应。Sheen 粗糙度影响衰减，追踪和 Max Roughness 截止仍使用法线抗锯齿后的基础层粗糙度。颜色或颜色贴图为零时恢复普通 PBR；Sheen 与 Clear Coat、Anisotropy、Iridescence、Transmission 的混合组合仍拒绝。
- Sheen 基础层接收复用现有几何、响应附件和 Trace / Filter / Composite，不新增材质 Resolve、Draw 阶段、附件或 source confidence 编码；独立运行时仍使用双 RGBA8，不要求 Half Float 响应附件。相对当前不接收的材质，仍会增加接收面绘制和有效追踪覆盖；不以 Pass 数量不变代替 GPU 性能验收。完整 Charlie 环境照明及绒面层本身的 SSR 不在此合同范围内。
- Scene / Camera 的 `reflectionContent` 默认为 `OpaqueOnly`；选择 `OpaqueAndTransparent` 后，才捕获显式开启贡献的透明材质。
- 贡献 Shader 同时提供 `ScreenSpaceReflectionContributionColor` / `ScreenSpaceReflectionContributionDepth`，声明 `screenSpaceReflectionContribution = "ColorDepthV1"`，两个 Pass 都解析为透明队列。

贡献 Color 采用正常透明排序、混合和材质深度写入设置；Depth 记录最近的非零 Alpha 深度。捕获使用当前帧不透明输入并暂时关闭 SSR 采样，避免反馈；原不透明颜色保留给 Composite，贡献颜色/深度用于追踪。颜色生成 mipmap，深度保持单层、Point 采样。

贡献失败保留不透明 SSR，报告 `contributionUnsupportedReason`；额外资源经现有 RenderTargetPool 回收。实现采用单个最近深度与已混合颜色，不提供逐层透明追踪。

## 运行状态与序列化

`renderingEnabled` 是运行时预览开关：保留作者配置和 consumer 请求，不克隆、不保存。Editor 的拾取、Gizmo、缩略图用它跳过 SSR。`debugMode`、请求、阶段覆盖、纹理、metrics 和预设名称均不进入作者资产。旧 `quality` setter 只调整步数，`applyQualityPreset()` 应用完整追踪预算，`applyPerformancePreset()` 只修改六个性能字段。`resolvedSettings.quality` 是旧相机/请求档位标签，不能表示 Scene 或自定义参数的实际质量；诊断应读取各数值字段。

`metrics`、`getResolvedSettings()`、`getReceiverTraceSettingsOverride()` 是纯读，返回最近解析结果。Scene 修改与跨 Scene 移动的结果在下一次渲染准备更新。贡献绘制统计和 profiler 范围用于诊断，不代表性能预算已验收。

Builder / Loader 保留 `scene.screenSpaceReflection`、Camera 原子属性、`.mat.screenSpaceReflection` 和 `.mat.contributeScreenSpaceReflection`。SSR 作者字段及派生 Uniform 不进入通用 Shader 属性序列化。

## 本地构建与验证

在 Engine 根目录执行：

```sh
node packages/modify/build/local-engine.mjs
pnpm exec vitest run --config packages/modify/tests/vitest.config.mjs
```

构建脚本将 core、design、galacean、loader、math、physics-physx、rhi-webgl、shader、shader-compiler、shader-parser、ui 复制到忽略目录 `.cache/engine`，应用 override 后执行原生模块和声明构建；design 按原生规则仅生成声明。构建不修改原生源码或发布配置。Editor 及 Sandbox 需使用同一套兼容产物，个人联调配置留在仓库外或忽略目录。

核心验证覆盖作者配置/Loader/生命周期、旧运行注册兼容、临时开关、六字段预设、透明能力声明及实际渲染。贡献用例保留接收/贡献四组合、Alpha 零、混合、遮挡、1x/4x MSAA、分配失败降级，以及 Heightfield / River 真实后端的 Auto 请求、可见倒影、贡献和销毁释放；不依赖静态截图文件。

当前验证边界：水体使用固定时间的最小场景，未覆盖宏观动态波浪、河流落差、完整世界内容或移动设备性能。正式预设、默认值和软上限等待后续标定；本地验证不代表正式 npm Engine 已包含这些接口。

## 已知取舍

- CR4-001、003 已修：属性注释归位；Editor 视口文案使用 Preview Scene SSR，与 Camera 配置来源区分。
- CR4-002 暂缓：保存仍保留贡献字段 false。省略它的试改通过局部测试，但完整材质 E2E 失败，恢复原序列化后通过；未改变接收作者所有权。
- CR4-004 暂缓：贡献能力判定已在每次捕获内复用，水体深度 Pass 仍复用 Forward。共享 Alpha 公式不直接依赖光照颜色，但编译程序仍保留相关 active uniform；不能据此推断 GPU 成本已被消除。后续拆分需保持覆盖率和提交生命周期一致。
