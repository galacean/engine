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

- Surface 几何附件保持 RGBA8：RG 是世界空间法线的 oct8 编码，B 是粗糙度，A 是响应权重；响应颜色使用独立 RGBA8 附件。所有 Surface 生产者必须传入最终世界空间法线，Trace、Upsample 和 Composite 解码后再转到视空间。ReceiverNormal Debug 仍显示视空间法线颜色。
- 固定的世界空间法线不会因相机旋转跨越量化档；这不消除 oct8 的静态角误差（世界向上法线约 0.226°），也不提高动态波浪、法线贴图或物体旋转造成的真实法线变化精度。真实法线仍会跨量化档，未增加时域纹理或改变显存预算。水体原有面向视线的法线翻面规则保留。
- 接收 Surface 声明 `screenSpaceReflectionReceiver = "ColorResponseV3"`，明确 RG 使用世界空间 oct8。旧视空间 `ColorResponseV2` 资产仍可加载并执行 Forward，但接收能力检查会拒绝它，显式注册、作者 On 和 Auto 均不会执行其 Surface/Trace；需重建 Shader 后才能重新接收 SSR。
- 透明接收还需 Forward 声明 `screenSpaceReflectionTransparentSample = "SampleV1"`，并实际采样 SSR。River / Heightfield 保持此合同。内置 PBR Forward 使用条件声明 `TransmissionV1`，仅允许未开启 Alpha 混合的独立 Transmission 接收；该条件在 UsePass、改名或复制 Shader 后仍有效，普通 Alpha 混合 PBR 继续拒绝。
- 内置 PBR 支持单独启用 Clear Coat、Sheen、Anisotropy、Iridescence 或 Transmission。Clear Coat、Sheen、Iridescence 使用基础层世界空间法线；Anisotropy 复用 Forward 已计算的弯曲法线，使 Trace 与环境扣除方向一致，但仍只有单条射线和一个粗糙度，不提供完整各向异性反射模糊。所有特性使用贴图解析及法线抗锯齿后的基础层粗糙度。粗糙基础层即使覆盖光滑清漆，也不再获得清漆专属的 SSR 倒影。
- SSR 只替换基础层环境反射。Surface 的基础层响应复用 Forward 的清漆衰减或 `bsdfData.sheenScaling`，衰减只应用一次。清漆环境反射、Sheen 光泽、直接光、漫反射和自发光仍由原有 Forward 计算。SSR 未命中或强度为零时保留 Forward 结果，LDR 场景复制可能产生原有的最多 1 LSB 量化差异。
- Clear Coat 的强度贴图及独立法线仍影响原有光照和基础层衰减。清漆法线和清漆粗糙度不决定 SSR 射线或截止。清漆强度为零或强度贴图值为零时恢复普通 PBR。Sheen 颜色或颜色贴图为零时也恢复普通 PBR。Sheen 粗糙度影响基础层衰减，不决定 SSR 追踪粗糙度。完整 Charlie 环境照明及 Sheen 光泽层自身的 SSR 不在此范围。
- 存在不透明接收者时使用两个 RGBA8 Surface 附件，仅有透明接收者时只使用一个 RGBA8 几何附件。每个接收阶段执行一次 Trace。不透明阶段沿用全屏 Composite，透明阶段将追踪结果交给 Forward 采样。不增加材质 Resolve、附件或扩展特性专用 Surface / Trace 协议。已移除动态选层、选层置信度及其 RGBA16F 响应附件升级，因此 Clear Coat 不再要求 Half Float 响应附件。Trace 纹理仍按现有能力选择 Half Float 或 RGBA8，其格式策略不变。
- 保留普通 SSR 的命中可信度、边缘淡出、距离淡出和粗糙度衰减。Trace 在过滤前以命中可信度预乘 RGB / Alpha，三种重建模式沿用同一信号。没有额外的选层淡出，也没有反预乘放大小 Alpha 的过程。
- Iridescence 复用 `initBSDFData()` 已解析的 `resolvedSpecularF0` 及能量补偿。强度、IOR、厚度及对应贴图影响现有彩色响应，不增加独立虹彩 SSR 协议。各向异性的直接高光和虹彩的原有材质光照继续由 Forward 计算。
- `transmission > 0` 会强制进入 Transparent 队列，即使 `isTransparent = false` 或启用 Alpha Test。SSR 保留这一折射绘制顺序。未开启 Alpha 混合的独立 Transmission 使用透明 Surface / Trace / Publish，随后 Forward 仅替换基础层镜面环境辐射，保留原有透射、漫反射、直接光和自发光。不提供新的屏幕空间折射，不允许 Alpha 混合透明 PBR 自动接收。
- Transmission 的 Auto 接收遵守 `StandardPbrAuto`，On 则显式启用。Pipeline 按当前相机和绘制元素检查接收意图、当前帧发布状态以及 stencil / mask 过滤；只有通过检查的 Forward 才选择带 SSR sampler 的可选变体。不会把派生宏写入共享 Material、Camera 或 Engine，因此被过滤的元素不会误采样其他接收者的反射。材质和相机强度各乘一次。Max Roughness 使用透明接收阶段的基础层粗糙度预算。Transmission 为零时恢复普通 PBR 队列；强度贴图局部为零时保留晚期队列，但透射贡献归零。
- Transmission 默认 Forward 不含 SSR sampler。可选变体在基础程序已链接后检查其实际纹理单元占用；仅在为 SSR 保留一个单元后仍不超过片元上限时启用，否则沿用基础 Forward IBL。计数包含 sampler 数组元素，并保守计入顶点阶段使用的单元。变体复用既有 ShaderPass / Engine 缓存和销毁路径，不新增纹理附件；接收阶段仍可能为最终回退 IBL 的满预算材质生成 Trace。
- 扩展材质的基础层接收仅允许复用内置 `Pipeline/ScreenSpaceReflectionSurface` 的实际 Pass。ShaderPool 在内置注册时记录 Pass 的弱引用身份，能力检查不查询最新同名 Shader；同名自定义 Shader 不会获得授权，也不会使已有材质失去能力。多次内置注册及 UsePass 保留各自的可信 Pass 身份，不因源 Shader 从名称表移除而改变。自定义 V3 Surface 的普通接收合同保持不变，不会因启用上述特性而自动获得基础层支持。首版只支持逐项启用，任意两项或更多扩展组合继续被拒绝。未发布的 `SingleLayerV1`、`BaseLayerV1` 和 `SignedAlphaV1` 专用 tag 不再使用。
- 相对原本不接收 SSR 的材质，这些特性仍增加接收面绘制及有效追踪覆盖。Transmission 复用已有透明接收阶段；与不透明接收者共存时会分别追踪两阶段。附件数量不变和删除分支不能代替移动设备 GPU 性能验收。本方案保留扩展层的原有间接反射，不等同于 Filament 按 SSR 权重统一替换整组间接镜面反射。
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
