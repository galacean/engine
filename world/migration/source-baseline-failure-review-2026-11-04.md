# 来源版本与失败归因复核（2026-11-04）

## 三种对象必须区分

| 对象 | World 内容 | 引擎基线 |
| --- | --- | --- |
| 干净的 engine-next/dev/2.0 | 039cbdcf223e96ff0ea06504556a669e8b23de23 | manifest 指向 bd34daa45612af8b402cd3be916ff181f21ae742 |
| 此前“原仓库直接复验” | dev/engine-next-experimental 的有效工作区，HEAD 0963b42d，MERGE_HEAD 039cbdcf，含未提交适配 | manifest 指向 5cac8daa6fbc6060a01d829a333f688df177cc25 |
| 本次修复前已推送迁移版 | engine/dev/engine-next@29206e853 | engine/dev/2.0@aa195af6，加显式 modify 实现 |

此前证明的是实验工作区与迁移版存在共同失败，不能据此证明干净的 engine-next/dev/2.0 全部具有相同失败。

## 已证实的反例：Day/Night

两个版本均未通过 overlay 替换 MaterialLoader。干净来源的旧基线 bd34daa 中，MaterialLoader 的 switch 没有 default 拒绝分支，未知 Select 字段会被忽略。实验基线 5cac8daa 中，加载器对不支持的类型直接抛错。相关原生引擎历史包含 1d06406ca / #3099（reject incomplete shader and material loads）。

读取此前 Demo 实际下载成功的 SkyMat.mat（HTTP 200），保留 shaderData.sunMode={type:"Select",value:2}。隔离脚本从两个 Git 版本的原 MaterialLoader.ts 用 AST 提取 _getMaterialByShader 方法，仅剥离 TypeScript 类型，用同一材质调用两份原方法。Material/向量对象用最小记录器代替，不启动 GPU，也不修改源代码。

- bd34daa：Promise 正常完成，未写入 sunMode。
- 5cac8daa：拒绝，消息为 MaterialLoader: unsupported shader data type "Select"。

这证明该异常属于引擎基线升级后暴露的资产兼容性问题，不属于“干净旧主线也必然出现的同一错误”。该方法级证据本身不能证明完整渲染或性能；后续浏览器复验见下文。

证据在 world/.acceptance/original-direct/compare-material-loader.mjs 与 material-loader-version-comparison.json。实验使用原方法和真实材质，不能当作两个版本的完整浏览器 A/B。

## 干净旧主线实际复验

从 `039cbdcf` 的 Git archive 提取 Gallery、manifest 和 overlay，使用与 manifest 完全匹配的旧引擎构建：`bd34daa`，198 个 overlay 文件，SHA256 `2f334927d6ed76e5edc1008d5418895607b002638aaf4842eba9f66d673a605f`。源码工作区和旧引擎均未修改。旧版和迁移版使用独立 Vite 缓存，避免依赖预构建缓存相互污染。

旧 Demo 使用原 Vite 配置、原资源、正常页面入口，没有 engineProbe 或时钟、随机数、RAF 替换。实际结果：

| 项目 | 干净旧主线结果 | 归因 |
| --- | --- | --- |
| Day/Night | 正午、午夜正常显示，无页面错误、HTTP 错误或失败请求 | 升级回归，必须恢复旧兼容行为 |
| Cute Zoo | `Invalid animal species: bull`，无 HTTP 错误或失败请求 | 旧数据含 `autonomy.cycles`，旧校验已拒绝此字段 |
| Metrics Zoo | `Ocean render field has no wet texels`，canvas 状态 failed，无 HTTP 错误或失败请求 | 全陆地场景仍请求编译海洋；旧实现也拒绝空 wet mask |
| 15 个相关 Vitest 文件 | 150 条：92 通过、58 失败 | 与此前 51 条失败加 7 条入场动画失败逐名称一致，无新增/消失失败 |
| Masonry 官方 runner | 47 条：43 通过、4 失败 | nativeAssets 夹具缺失 2 条、junction 旧接口 1 条、Worker 错误文本 1 条 |
| shared/tiny-glade 两文件 | 22 条：18 通过、4 失败 | rim 数量 1 条、nativeAssets 夹具缺失 2 条、浮点严格相等 1 条 |

Vitest 使用来源原正式配置、原断言和原超时；Masonry 从正确的根目录运行原 runner。shared 两文件仍需要仅补 TS 扩展名解析的 loader，未替换实现或断言；不能称其未经运行环境适配即可直接执行。

建筑旧验收的 6 个 ENOENT 仍归因于验收 cwd 错误，不计为来源产品缺陷。以上是失败相关范围的复验，不是旧主线全仓单测全量结果。

证据目录 `world/.acceptance/old-mainline/`：`verified-engine.json`、`browser.json`、正午/午夜截图、`units.json`、`units.log`、`masonry.log`、`shared-building.log`。目录被 Git 忽略，报告保留基线、方法和结果供复验。

## 修复：仅在 engine-modify 恢复旧材质契约

新增 `packages/modify/src/native/loader/src/MaterialLoader.ts` 并登记到 `native-overrides.json`。它保留当前引擎的 Shader 和 Texture 引用有效性检查，移除未知 shaderData 类型的提前拒绝及 switch default 抛错，恢复旧版静默忽略行为。`Select`、`Toggle` 不转换为其他类型，也不写入 ShaderData。

原生 `packages/loader`、其他原生引擎源码、examples、来源 Demo 数据与原测试断言均不修改。此兼容层明确以干净旧主线为依据，不能因其不同于实验工作区就再次撤销。

CR 发现初次兼容实现移除前置校验后，`shaderData: { broken: null }` 会在创建 Material 后同步抛错，绕过原有异步清理。相对修复前的目标分支，连续三次失败使 Material 数量从 10 增至 13。

最终实现把字段、宏解析及依赖加载置于统一错误清理边界，失败时销毁本次 Material 并传播原错误。纹理引用在同步解析结束后开始加载，全部加载成功后才写入材质。晚到的依赖结果不会再写入已失败的材质，共享纹理由 ResourceManager 管理。

最终修复后的验证：

- 修改层完整浏览器测试：21 文件，318 条通过，包含 10 条兼容与清理测试。
- 修改层材质专项：15 条通过，4 条按契约筛除（3 条原生未知类型拒绝、1 条 Shader 重复创建拒绝）。不能把筛除计为通过。
- 原生材质套件不加载 modify：9 条全部通过，原生严格契约保持。
- 最终修复版 Day/Night 开发入口、生产入口均实际切换正午和午夜，页面错误、HTTP 错误与失败请求均为 0；截图已目检。

10 条包内测试使用真实 WebGLEngine/ResourceManager：5 条覆盖 Select、Toggle、Matrix、TextureArray 的忽略、有效 Float 与宏的保留，以及 shaderRef 加载；4 条覆盖空字段、损坏向量、空宏列表和空纹理引用，每条重试三次并检查资源集合与缓存；1 条验证正常纹理与未知字段混合加载。

四类泄漏回归在修复前均失败，修复后均通过。复审额外运行原泄漏复现和两个可控完成顺序的纹理依赖用例，连同 10 条包内测试共 13 条通过。原复现 Material 数量保持 10 → 10。另一个纹理晚到成功或失败均未遗留材质、误销毁共享纹理或产生未处理异常。两个时序用例使用公开 Loader 注册及 ResourceManager.load 入口，作为隔离诊断保存在本地证据目录，不计入包内 318 条测试。

最终验收证据在 `world/.acceptance/cr-material/`：`regression-before.log`、`regression-after.log`、`modified-engine.log`、`native-material.log`、`typecheck.log`、`day-night-build.log`、`browser.json`、`acceptance.json`、`rereview.json`。类型检查保留原生 1 条既有诊断，无新增诊断。源码与测试修复仅发生在 `packages/modify`，本次提交同时更新验收配置和报告。

以下帧间隔和像素指标来自材质兼容初次修复后的对照。最终资源清理修复后只复跑了上述测试、构建和页面显示，未重新采集性能窗口。

Day/Night 另行串行执行修复版 → 旧版复测，同机 Chromium/Metal、1280×720、DPR 1，通过原 UI 暂停时钟并跳转正午、午夜。每种状态预热 15 秒、采样 3 个 5 秒 RAF 帧间隔窗口，无 Engine.update 注入。两侧每窗口均 301 个帧间隔，中位数均约 16.7 ms，p95 均为 16.7–16.8 ms。该结果仅支持两个固定状态未见流畅度退化，不测量 Engine CPU/GPU 时间或完整启动性能。

暂停后 UI 的 IBL 状态标签只在 stateChanged 时刷新，不能将其残留的 capture/prefilter 文案用作实时就绪指标。首次等待该标签 idle 的补测超时属于验收脚本判据错误，改为统一预热后重新采样；没有修改产品逻辑。

固定状态截图已目检，并比较去掉左上 HUD、左下动态统计和右侧 GUI 的 573460 个场景像素：正午仅 2 像素、午夜仅 4 像素各有合计 1 级 RGB 差异，平均通道绝对差分别为 0.00000116、0.00000233（0–255）。比较区域坐标与指标保存在 `day-night-image-comparison.json`，帧间隔在 `day-night-steady.json`，截图为 `*-steady-*.png`。不能据此外推动态时段或其他 Demo。

`WORLD_DEMO=day-night-system pnpm --dir world build` 在兼容修复和最终清理修复后均通过（仅有产物体积提示）。

## 当前结论

旧主线没有、升级或迁移后新增的问题必须修复，并以旧行为为依据。已确认并修复 Day/Night 的材质兼容回归；其他两页和上述单测失败已在干净旧主线复现，保持独立登记。不能继续把此前 3 页共同失败全部归因为旧主线已有问题，也不能据本次局部复验声明全量 Demo、交互和性能已通过。
