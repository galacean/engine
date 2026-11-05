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

Auto 使用有效 consumer 请求的整组参数；ForceOn 使用作者参数；ForceOff 压住请求但保留 lease。六字段预设来自 Engine `getQualityPreset()`，仅包含 resolutionScale、upsamplingMode、maxRaySteps、thickness、maxRayDistance、hitRefinementSteps，不改变视觉字段、模式或内容选择。

材质作者数据是不可变快照。缺少作者字段的旧材质保留 `setMaterialReceiver()` 运行注册能力；显式设置作者值后，运行 API 返回 false，避免覆盖作者意图。清除作者配置恢复原运行状态。队列、Shader 和不兼容效果变化会重新解析，但不清除作者值或强度。

## Shader 契约与透明贡献

- 接收 Surface 声明 `screenSpaceReflectionReceiver = "ColorResponseV2"`。
- 透明接收还需 Forward 声明 `screenSpaceReflectionTransparentSample = "SampleV1"`，并实际采样 SSR。普通 PBR 不支持透明接收；River / Heightfield 支持。
- Scene / Camera 的 `reflectionContent` 默认为 `OpaqueOnly`；选择 `OpaqueAndTransparent` 后，才捕获显式开启贡献的透明材质。
- 贡献 Shader 同时提供 `ScreenSpaceReflectionContributionColor` / `ScreenSpaceReflectionContributionDepth`，声明 `screenSpaceReflectionContribution = "ColorDepthV1"`，两个 Pass 都解析为透明队列。

贡献 Color 采用正常透明排序、混合和材质深度写入设置；Depth 记录最近的非零 Alpha 深度。捕获使用当前帧不透明输入并暂时关闭 SSR 采样，避免反馈；原不透明颜色保留给 Composite，贡献颜色/深度用于追踪。颜色生成 mipmap，深度保持单层、Point 采样。

贡献失败保留不透明 SSR，报告 `contributionUnsupportedReason`；额外资源经现有 RenderTargetPool 回收。实现采用单个最近深度与已混合颜色，不提供逐层透明追踪。

## 运行状态与序列化

`renderingEnabled` 是运行时预览开关：保留作者配置和 consumer 请求，不克隆、不保存。Editor 的拾取、Gizmo、缩略图用它跳过 SSR。`debugMode`、请求、阶段覆盖、纹理、metrics 和预设名称均不进入作者资产。

`metrics`、`getResolvedSettings()`、`getReceiverTraceSettingsOverride()` 是纯读，返回最近解析结果。Scene 修改与跨 Scene 移动的结果在下一次渲染准备更新。贡献绘制统计和 profiler 范围用于诊断，不代表性能预算已验收。

Builder / Loader 保留 `scene.screenSpaceReflection`、Camera 原子属性、`.mat.screenSpaceReflection` 和 `.mat.contributeScreenSpaceReflection`。SSR 作者字段及派生 Uniform 不进入通用 Shader 属性序列化。

## 本地构建与验证

在 Engine 根目录执行：

```sh
node packages/modify/build/local-engine.mjs
pnpm exec vitest run --config packages/modify/tests/vitest.config.mjs
```

构建脚本将 core、design、galacean、loader、math、physics-physx、rhi-webgl、shader、shader-compiler、ui 复制到忽略目录 `.cache/engine`，应用 override 后执行原生模块和声明构建；design 按原生规则仅生成声明。构建不修改原生源码或发布配置。Editor 及 Sandbox 需使用同一套兼容产物，个人联调配置留在仓库外或忽略目录。

核心验证覆盖作者配置/Loader/生命周期、旧运行注册兼容、临时开关、六字段预设、透明能力声明及实际渲染。贡献用例保留接收/贡献四组合、Alpha 零、混合、遮挡、1x/4x MSAA、分配失败降级，以及 Heightfield / River 真实后端的 Auto 请求、可见倒影、贡献和销毁释放；不依赖静态截图文件。

当前验证边界：水体使用固定时间的最小场景，未覆盖宏观动态波浪、河流落差、完整世界内容或移动设备性能。正式预设、默认值和软上限等待后续标定；本地验证不代表正式 npm Engine 已包含这些接口。

## 已知取舍

- CR4-001、003 已修：属性注释归位；Editor 视口文案使用 Preview Scene SSR，与 Camera 配置来源区分。
- CR4-002 暂缓：保存仍保留贡献字段 false。省略它的试改通过局部测试，但完整材质 E2E 失败，恢复原序列化后通过；未改变接收作者所有权。
- CR4-004 暂缓：贡献过滤重复执行，水体深度 Pass 仍复用 Forward。共享 Alpha 公式不直接依赖光照颜色，但编译程序仍保留相关 active uniform；不能据此推断 GPU 成本已被消除。后续拆分需保持覆盖率和提交生命周期一致。
