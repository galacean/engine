# SSR 阶段 0：作者配置契约

本地实现基线：`dev/engine-next@ae0aaf81c`。本阶段提供 Engine 公共接口、Loader 契约、本地打包和 Editor link。Inspector、Editor Source 类型扩展、投影和 Builder 字段转发在阶段 1 接入。

## 公共接口

| 作者位置 | API | 持久数据 |
| --- | --- | --- |
| Scene | `scene.screenSpaceReflection.apply(data)`；字段 setter；`toJSON()` | `ScreenSpaceReflectionSettingsData` |
| Camera | `camera.screenSpaceReflectionSettings` 原子读写 | `{ settingsSource, overrideSettings }` |
| Material | `material.screenSpaceReflection = { mode, intensity }` | `{ mode: "Auto" \| "Off" \| "On", intensity }` |
| 预设 | Scene settings 或 Camera SSR 的 `applyPerformancePreset(quality)` | 仅写六个性能参数，无档位字段 |

`ScreenSpaceReflectionSettingsSource.UseSceneSettings = 0`，`Override = 1`。相机默认跟随所在场景，在渲染准备入口检查当前 `entity.scene` 与 Scene 配置版本，支持动态创建、跨场景移动，不依赖 Editor 扫描或覆盖相机。首次切到 Override 时复制当前 Scene 作者参数；Camera 的 `overrideSettings` 保存独立参数，切换来源不会清除，从未单独设置过时省略该字段。序列化使用原子属性 `screenSpaceReflectionSettings`，避免嵌套属性加载顺序改变来源。此属性赋值是完整快照恢复：省略 `overrideSettings` 会清除已有独立设置的初始化状态，下次首次 Override 复制当时的 Scene；含 Partial override 时，未提供字段以当前 Scene 为基线。增量修改使用 `applySettings()`。SceneLoader 在构造相机前同步应用 Scene SSR，使加载与运行时赋值采用相同基线。

已有脚本直接写 `camera.screenSpaceReflection.intensity` 等作者参数时会选择 Override，保留显式 Camera API 的作用。`enabled`、consumer lease、debugMode、阶段覆盖仍是独立运行接口。`metrics`、`getResolvedSettings()`、`getReceiverTraceSettingsOverride()` 均纯读，不遍历请求或写 ShaderData。`metrics.resolvedSettings` 是最近一次配置解析的快照：相机自身参数/请求变化立即更新，Scene 参数变化和跨 Scene 移动在下一次相机渲染准备时更新；Camera SSR 上的参数 getter / `toJSON()` 是相机保留的单独设置。

运行时 `new Scene()` 与 SceneLoader 加载缺 SSR 字段的旧文件均使用 Auto、ExplicitOnly 和旧 Engine 参数（全分辨率、GaussianBilateral、最大距离 20）。Editor 新建场景模板显式保存 Auto、StandardPbrAuto 和 Medium 的六个性能字段；产品默认不改变运行时构造行为。Partial 输入的缺省字段继承运行时默认，Editor 面板也采用同一基线。旧资产不会因为加载而写回新默认。

Auto 下 consumer 按现有优先级整组选择；ForceOn 使用作者参数，ForceOff 压住请求，二者均不销毁 lease。显式阶段 trace override 保留为高级运行机制。Scene 与 Camera 共用作者字段校验和六字段预设提取，六字段预设来自 `getQualityPreset()`；运行时默认保留旧接收策略与追踪预算。Editor 纯数据模板与 Engine Medium 的一致性由跨仓浏览器测试校验。预设方法只改 resolutionScale、upsamplingMode、maxRaySteps、thickness、maxRayDistance、hitRefinementSteps；视觉参数及启停、请求保持原值。

材质作者值独立于 Shader 参数，读取时是不可变快照，修改应整体赋值。接收判定在提交对应队列时检查缓存是否失效：On 对不透明/AlphaTest 使用 OpaqueComposite，透明使用 TransparentSampleOnly；透明接收同时要求 Surface 的 `screenSpaceReflectionReceiver = "ColorResponseV2"` 和活跃 SubShader 中 Forward 的 `screenSpaceReflectionTransparentSample = "SampleV1"`。后者声明 Forward 确实采样相机发布的 SSR 纹理，不能从 Surface 输出、Shader 名称或 Pass 数量推断。内置 PBR 和改名的同一 PBR 均不满足透明契约；河流与 Heightfield 的真实 Forward 模板已补声明。Auto 仅标准 PBR 在场景策略允许时接收。Shader、队列和不兼容效果变化不会丢失作者意图；恢复后重新生效。Off 保留作者强度。缺少作者字段的旧材质加载后保持运行 API 所有权，`setMaterialReceiver()` 可开启、关闭及重新开启。显式 `.mat.screenSpaceReflection` 或作者 setter 拥有设置后，旧运行 API 返回 false 且不覆盖作者状态；修改该材质应使用作者 setter。内部派生写入走独立私有方法，不调用公开运行 API。

透明贡献不属于阶段 0，当前没有该字段或渲染能力。

## Source 与编译目标

阶段 1 沿用 Editor 的公共事务链路，不新增 SSR 历史或相机同步轮询：

| Editor Source | 公开编辑入口 | Builder 输出 / Engine 加载 |
| --- | --- | --- |
| `scene.screenSpaceReflection` | `SceneFacade.updateSetting("screenSpaceReflection/<field>", value)`；预设用 `batchUpdateSettings` | `SceneFile.scene.screenSpaceReflection` → SceneLoader |
| Camera `props.screenSpaceReflectionSettings` | `ComponentFacade.updateComponent(entityId, componentId, props)` | 同名原子属性 → 现有 ReflectionParser → Camera setter |
| `.mat.screenSpaceReflection` | `InspectorFacade.assetChange` → 既有材质事务 | `IMaterialSchema.screenSpaceReflection` → MaterialLoader |

Editor 当前类型入口是 `packages/tsconfig/global-types/scene-schema-v2.ts`。上述 Scene 路径还需在阶段 1 扩展类型、规范化、投影及 Builder；本阶段只确定字段和公开写入口，不宣称 Editor 已可编辑或保存 SSR。

加载示例（数字枚举使用 Engine 导出值生成）：

```ts
scene.screenSpaceReflection.apply({ activationMode: ScreenSpaceReflectionActivationMode.ForceOn });
camera.screenSpaceReflectionSettings = {
  settingsSource: ScreenSpaceReflectionSettingsSource.Override,
  overrideSettings: { activationMode: ScreenSpaceReflectionActivationMode.ForceOff, intensity: 0.6 }
};
material.screenSpaceReflection = { mode: "On", intensity: 0.7 };
```

不保存 quality、预设名称、请求、GPU 纹理、metrics、调试模式。场景与相机的 `toJSON()` / 原子属性明确列举字段。

## 本地构建、link 与验证

在 Engine 根目录执行：

```sh
node packages/modify/build/local-engine.mjs
pnpm exec vitest run --config packages/modify/tests/vitest.config.mjs
```

脚本只复制 core、design、galacean、loader、math、physics-physx、rhi-webgl、shader、shader-compiler、ui 到 `packages/modify/.cache/engine`，应用全部对应 override，再执行原生 `b:module` / `b:types`。依赖使用已安装工具和 staging 内部包链接，不下载依赖、不发布、不修改原生源码。Shader 同时输出编译结果和 raw sources。Core 声明从公开 `src/index.ts` 依赖图生成，与 Rollup 一致，避免把已被旧粒子实现替代且不再导出的原生模块纳入声明构建。

Editor 的编辑视口和 Play 预览需要使用同一套兼容的 Engine 产物。个人联调入口独立于仓库代码维护，不修改 Editor 的版本清单或共享包链接。构建目录暂时不可用时，应等待构建完成后再刷新。

浏览器测试使用这套构建产物，覆盖三台加载相机、场景默认/旧场景、移动/克隆/销毁、六字段预设、consumer 仲裁、材质加载及效果恢复、透明接收契约、序列化回环，并执行真实 WebGL SSR surface/trace 管线。附带运行既有材质加载和 toolkit 兼容测试。它不等于 Editor 编辑/保存验收、透明水体画面验收或移动端/GPU 性能验收。

## CR 修复与验证记录（2026-11-04）

| 编号 | 核实与修复 | 回归证据 |
| --- | --- | --- |
| CR-001 · P1 | 成立。旧资产不隐式获得作者所有权；公开运行 API 与内部派生写入分离，显式作者配置优先 | 真实 MaterialLoader 加载后运行注册、关闭、重开；显式作者 Off/On 拒绝运行覆盖 |
| CR-002 · P1 | 成立。完整快照恢复能还原未初始化 Override；增量修改仍由 applySettings 承担 | 初始快照 → Override → 恢复 → Scene 改值 → 首次复制；既有独立设置快照恢复 |
| CR-003 · P1 | 成立。增加 Forward SampleV1 声明，删除按 PBR 名字拒绝的规则与改名 PBR 错误正例 | 改名 PBR 拒绝透明接收；实际采样 Shader 的 WebGL 编译和注册；两个水体模板的 ShaderLab 声明解析 |
| CR-004 · P2 | 成立。相机反序列化前初始化 Scene SSR | 实际 SceneLoader 与运行时的 Partial Override 完整结果一致 |
| CR-005 · P2 | 成立。诊断 getter 纯读；渲染准备按 Scene 对象/版本更新 | Spy 验证重复读取零解析/零 ShaderData 写入；配置变化、跨 Scene、请求及销毁；真实渲染入口消费 Off/On/强度变化 |

- 五个 finding 的回归断言在修复前 staging 构建产物上均失败；修复后通过。此前 20 项测试并未覆盖这些边界，不能作为放行依据。
- 最终本地 10 包 `b:module` / `b:types` 成功，包括 Engine knowledge 校验。
- Chromium：4 个文件、27 项全部通过（作者契约 8、CR 回归 8、材质加载兼容 10、toolkit 兼容 1）。
- 修改源码 ESLint 无 error，保留既有整文件源码的 31 项 warning；Prettier 与 `git diff --check` 通过。
- Editor link 保持当前 `packages/modify/.cache/engine` 的 10 包，已重新回读。Editor 原有未提交代码未改动；已有服务需要重启/刷新以使用新构建。
- 水体模板检查保留了真实 Forward 的能力声明，但未执行整套水体 AOT 构建或水体画面验收；透明采样正例是带实际采样代码的独立 Shader。普通 PBR 的 surface/trace 执行不代表透明水体效果通过。
- CR-005 验证的是 CPU 解析和 ShaderData 写入次数，未测 GPU 耗时或帧率。未推进阶段 1 面板或阶段 3 透明贡献。


## CR2 核实、取舍与验证（2026-11-04）

审查基线为 `a98c24f03`，同时检查 Editor `feat/ssr-minimal-loop` 未提交实现。此节是第二轮结论；上节 CR-001～CR-005 的修复保留，没有重开。修复留在工作区，未 commit、push 或创建 PR，未推进阶段 2。

| 编号 | 核实结论与处理 | 证据与改动 |
| --- | --- | --- |
| CR2-001 · P1 | 成立，修复实际 Picker 调用；保留显式写字段选择 Override 的契约 | 修复前调用真实 `SeedWorldPicker.warmup()` 后，来源从 UseSceneSettings 变成 Override。Picker 改为保存/恢复完整 `screenSpaceReflectionSettings`，参数 getter 注释明确读取独立值。覆盖首次跟随、暂存独立值、独立来源及异常退出，恢复后仍按正确来源解析强度。 |
| CR2-002 · P1 | 默认值兼容问题成立；选择恢复运行时旧默认，Editor 新建模板显式保存产品默认 | `WorldEnvironmentRuntime` 的 terrain-surface-water 请求只给 receiverMode，预算仍依赖默认；`WorldBubbleLoadingScene` 等运行时构造路径不经过旧文件 Loader。真实 WebGL fixture 中，水体透明消费者 + roughness 0.3 的普通 PBR 在修复前得到 1 个不透明接收者，修复后为 0，显式启用 StandardPbrAuto 后重新进入接收。修改 Settings 默认、Loader 共用默认来源及 Editor 模板/面板缺省解析；模板六字段与 Engine Medium 逐项匹配。 |
| CR2-003 · P1 | 成立，增加派生缓存和同值写入保护 | 阶段 1 明确编辑材质后会保存作者数据。修复前四次查询加一次同值赋值产生 10 次 setFloat。现在按作者值、Shader、队列、相关效果宏位图及活跃 Pass 标签快照校验缓存；命中不重新做能力解析、不写 Uniform。ShaderPart 的标签可变且没有版本号，保留轻量标签比较，避免按 Shader 对象身份缓存造成陈旧结果。缓存使用 WeakMap，不进入资产或克隆数据。 |
| CR2-004 · P1 | getter 合成默认的事实成立，但所述 Editor 保存缺陷已被阶段 1 覆盖；不改签名 | `MaterialAsset._getMainData()` 仅在 `_screenSpaceReflectionAuthorSettings` 非空时保存 SSR，且过滤两项派生 Uniform。新测试调用实际 `getMainData()` 序列化并经 MaterialLoader 重载：未编辑 SSR 的材质即使改了 roughness、运行注册过，保存仍省略作者数据，重载后运行注册成功；显式 Auto 编辑则保存作者值并拒绝运行接管。 |
| CR2-005 · P2 | 格式差异成立，暂不修 | Material import 区接口位置、Scene import 顺序与 Settings getter 注释风格仍存在。没有功能或构建失败，不在此次接口修复中重排公开 API。CR2-001 所需的 getter 语义注释单独补齐。 |
| CR2-006 · P2 | 部分成立，暂不重构 | 两个旧私有枚举 sanitizer 只有定义、无调用；实际作者入口统一走 Settings.normalize，再复用消费者数值校验。无当前可复现的双重生效冲突。非法距离回退 20 与本轮选择的运行时默认一致。保留死代码清理为独立低优先级项。 |
| CR2-007 · P2 | 局部重复成立，保留现有覆盖 | 连续 prepare 与部分首次复制/跨 Scene 断言可合并；但 Loader 重载、快照恢复及诊断 spy 的触发链不同，五个宏也分别对应能力声明。此次不因用例数量删减回归；旧所有权、可编译采样 Shader、Partial Override 和纯读 spy 均保留。 |

本轮验证：

- 修复前新增三个 Engine 回归全部失败，分别复现来源丢失、额外接收者和重复 Uniform 写入；修复后 Engine Chromium 5 文件、30 项通过，其中包括旧 CR 的全部回归。
- 本地 10 包模块与声明构建成功，包括 Engine knowledge 校验；整文件 override 和 Schema 路径保持不变。Editor link 回读仍指向当前 staging 的同一 10 包。
- Editor 材质浏览器测试 6 项通过，含新增默认模板匹配、真实材质保存/重载所有权两项；Model 对应测试 88 项、Builder 99 项通过。
- Editor 既有阶段 1 Playground E2E 2 项通过：Scene/Camera/Material 编辑、持久化、撤销重做，以及 Builder → Sandbox 预览。
- Editor `pnpm tsc`、`pnpm lint` 通过。Engine 本轮修改源码 ESLint 0 error、5 项既有 Loader warning；格式检查及两仓 `git diff --check` 通过。

验收边界：没有对完整 Seed World/水体场景进行前后画面对比，不能据此声称所有现有场景都会增加 Draw Call；额外接收者数量来自明确的 WebGL fixture。材质缓存仍检查少量宏和可变标签，未测 CPU 帧时间、GPU 耗时或 FPS。未重新执行完整 Editor 浏览器套件，阶段 1 文档记录的 4 项环境光基线失败没有在本轮修复或宣称通过。未做透明贡献、移动端或完整发布兼容验收。


## CR3 作者状态恢复（2026-11-04）

- CR3-001：`material.screenSpaceReflection = null` 释放作者所有权，并恢复第一次作者编辑前的运行接收参数与注册状态。后续作者编辑不覆盖这个基线；克隆携带独立快照。恢复保留暂时不兼容的旧注册，接收判定仍检查当前 Shader/效果，恢复兼容后才能再次接收。运行快照不进入资产。
- Editor 的材质模型以 null 表示无作者数据，面板单独补显示默认。首次编辑的历史基线因此能保留作者缺省状态，撤销后旧运行 API 再次可用。保存时省略 null，不把合成默认或运行参数写回资产。
- 新增 Engine 回归覆盖作者 Off/On 后释放、精确强度恢复、克隆、重复释放、再次编辑，以及不兼容效果恢复。Engine Chromium 31 项通过，旧 CR 与 CR2 回归均保留。
- 10 包模块与声明构建、Engine knowledge 校验通过。本轮提交范围不含工作区额外的 AmbientLightLoader 注册；最终 staging 使用已提交的 Loader index 验证，避免依赖该 WIP。
- Editor 跨仓验证覆盖首次编辑撤销/重做、材质重开恢复 Domain、相机 Partial Override 对齐与后续编辑，详见 Editor 的 SSR_AUTHORING.md。无 GPU/FPS 或完整世界场景验收结论。
