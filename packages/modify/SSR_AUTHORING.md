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

新建 Scene 默认 Auto、StandardPbrAuto、Medium。SceneLoader 加载缺 SSR 字段的旧文件时使用 Auto、ExplicitOnly 和旧 Engine 参数（全分辨率、GaussianBilateral、最大距离 20）。旧资产不会因为加载而写回新默认。

Auto 下 consumer 按现有优先级整组选择；ForceOn 使用作者参数，ForceOff 压住请求，二者均不销毁 lease。显式阶段 trace override 保留为高级运行机制。Scene 与 Camera 共用作者字段校验和六字段预设提取，Scene Medium 初值来自 `getQualityPreset()`。预设方法只改 resolutionScale、upsamplingMode、maxRaySteps、thickness、maxRayDistance、hitRefinementSteps；视觉参数及启停、请求保持原值。

材质作者值独立于 Shader 参数，读取时是不可变快照，修改应整体赋值。接收判定在提交对应队列时重新解析：On 对不透明/AlphaTest 使用 OpaqueComposite，透明使用 TransparentSampleOnly；透明接收同时要求 Surface 的 `screenSpaceReflectionReceiver = "ColorResponseV2"` 和活跃 SubShader 中 Forward 的 `screenSpaceReflectionTransparentSample = "SampleV1"`。后者声明 Forward 确实采样相机发布的 SSR 纹理，不能从 Surface 输出、Shader 名称或 Pass 数量推断。内置 PBR 和改名的同一 PBR 均不满足透明契约；河流与 Heightfield 的真实 Forward 模板已补声明。Auto 仅标准 PBR 在场景策略允许时接收。Shader、队列和不兼容效果变化不会丢失作者意图；恢复后重新生效。Off 保留作者强度。缺少作者字段的旧材质加载后保持运行 API 所有权，`setMaterialReceiver()` 可开启、关闭及重新开启。显式 `.mat.screenSpaceReflection` 或作者 setter 拥有设置后，旧运行 API 返回 false 且不覆盖作者状态；修改该材质应使用作者 setter。内部派生写入走独立私有方法，不调用公开运行 API。

透明贡献不属于阶段 0，当前没有该字段或渲染能力。

## Source 与编译目标

阶段 1 沿用 Editor 的公共事务链路，不新增 SSR 历史或相机同步轮询：

| Editor Source | 公开编辑入口 | Builder 输出 / Engine 加载 |
| --- | --- | --- |
| `scene.screenSpaceReflection` | `SceneFacade.updateSetting("screenSpaceReflection/<field>", value)`；预设用 `batchUpdateSettings` | `SceneFile.scene.screenSpaceReflection` → SceneLoader |
| Camera `props.screenSpaceReflectionSettings` | `ComponentFacade.updateComponent(entityId, componentId, props)` | 同名原子属性 → 现有 ReflectionParser → Camera setter |
| `.mat.screenSpaceReflection` | `AssetFacade.writeContent` | `IMaterialSchema.screenSpaceReflection` → MaterialLoader |

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

在 Editor 根目录执行（已有 link 先 `--unlink`）：

```sh
node scripts/link-local-engine.mjs /Users/xingyi/Documents/github_code/engine/packages/modify/.cache/engine
node scripts/link-local-engine.mjs --status
```

重启现有 Editor dev server 后生效。恢复 npm 包用 `node scripts/link-local-engine.mjs --unlink`。不 link spine、xr 或 World 源码包。重建过程中该缓存目录会暂时不可用，应在构建完成后刷新。

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
