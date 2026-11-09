# Water Editor 消费契约

2026-11-08。共同设计：`2026-11-07-WaterBody简化接入设计.md`。Engine 基线
`89e4ac8b1a031de022445bba59bb8528da1c2926`，包含未提交输入；以 snapshot manifest 中的逐文件哈希为准。

## 公开入口和作者边界

`@galacean/engine-water/water/native/index` 导出原始 `WaterBodyComponent`、
`WaterSystem`、`registerNativeWater`，以及形状/能力/材质校验、质量创建与补丁、
创建预设、地床编码/解码与解析、连接图编译。深路径保持可用；入口重新导出同一实现，
不创建新类、不改变已有默认值。Editor 的公开名称可为 `WaterBody`，持久化类型保持
`WaterBodyComponent`，作者配置保持 `authoring`。不要把运行 `configuration` 序列化成作者数据。

`validateWaterAuthoringSettings` 校验值与能力，`compileWaterShape` 在最终地床上校验几何。
Model 负责事务最终快照、Scene/Prefab 引用作用域和受影响消费者集合。显式预检不能替代最终校验。

## 宿主协议

方法名是 `beginInputUpdate()`、`endInputUpdate(accept = true, flush = true)`、
`flushAuthoring()`；不存在 `beginAuthoringUpdate/endAuthoringUpdate` 别名。
在完整作者投影前 begin，安装所有输入后 end，再 await flush。公共激活协议需分开 finish/after
时使用 `endInputUpdate(applied, false)`，after 消费宿主输入并 await flush。
`configureRuntime(options, environment?, integration?)` 只允许首次运行初始化前调用。
一个 Scene 一个系统；绑定后换相机需重建该 owner。运行诊断、查询、拾取用公开
`runtimeState`、`sample/sampleDrops`、`resolveRenderOwner`；退出时 await `dispose()`。

禁止 Editor 依赖下划线方法、`nativeWaterOwners`、编译缓存或内部渲染节点。生成 Mesh、
材质私有克隆、空间场、相机需求和候选资源由 Water owner 管理，不进入作者对象或保存记录。
`visible=false` 保留查询；禁用/删除同步撤出运行，在途候选不得复活。已有生命周期测试覆盖这些边界。

Material 是借用的引用计数资源；组件保留/替换/复制/释放自己的引用，不销毁共享作者材质。
JSONAsset/BufferAsset 是 EngineObject，不实现引用计数；组件借用其引用并缓存解码快照，
不负责销毁公共资产。地床资源对、描述版本1、Float64编码与校验和保持不变。

## 两种装配必须互斥

- SeedWorld：加载前 `registerNativeWater()`；保留 `openSeedWorldProject`、
  `PlanningWaterRuntime`、`NativeWaterHost(hostTerrain: true)` 与原初始化/发布/关闭顺序。
  portable 入口选择 `seed-world` 后不注册 Loader、不创建系统。不要混用另一个 bundle 的 Water 类。
- 普通独立项目：portable 注册原始组件，加载 Project 后调用并等待
  `initializeProjectWaterRuntime(engine)`，然后 `engine.run()`。重复初始化复用 Scene owner；
  Scene 切换后再次初始化。已有异类注册拒绝覆盖，同一 realm 不能切换模式。

Loader 的组件 key 为全局 `WaterBodyComponent`。旧 ProjectWaterBody 子类方案会覆盖它；
Editor 新 generator 已改为原类注册。Builder 仍须验证实际生成模块能解析、导入和执行，
源级 mock 测试不足以证明独立产物。

## SeedWorld 真正入口

应用入口：`world/demos/seed-world/main.ts` → `mountSeedWorldDemo`（`SeedWorldDemo.ts`）。
项目入口：`world/demos/seed-world/SeedWorldProject.ts:openSeedWorldProject`。
原始项目：`packages/terrain/src/data/seed-world/project.json`，Scene 为 `Scene/SeedWorld.scene`，
物理文件在同目录 `public/Scene/SeedWorld.scene`。这是原始资源清单，不是完整已初始化水体的 Editor 工程导出。

SeedWorld 装配从 Source 规划生成具体作者水体；保留
`preparePlanningWaterSource`、`initializePlanningWater`、`initializePlanningOcean` 及
`PlanningSeedScenePublication` 的 Terrain/Water 原子发布。其脚本、资产格式、植被、农场、
规划宿主不可由一个通用 Water fixture 代替。Editor 直接打开原始 Scene 不能等同于完整 SeedWorld 验收。

项目清单版本1、原始 Scene 版本2.0、保存命名空间 buildings-v7-groups、
`seed-world-water-shader-aot-v1` 都保持现状。AOT 清单自身记录的历史 Engine alpha.41
来源不是本次 Water snapshot 的源版本；不得混淆。

## 仓库外快照导出

```sh
node packages/water/scripts/export-editor-snapshot.mjs \
  --editor-runtime /path/to/editor/packages/water-runtime \
  --out /new/external/artifact/directory
```

脚本复制并使用消费者的 generator，在仓库外构建 runtime、authoring 声明、project-source、
原生资产和 Shader include 闭包，打包并验证逐文件内容。它不修改 Editor，也不覆盖既有工件。
`export.json` 记录路径、Engine SHA、dirty 标记、archive SHA-256 及 generator 哈希。
详细验收、完整 WIP 范围与跨仓库阻塞由本次 `engine-handoff.json` 交付。

## SeedWorld 同名 Shader 的兼容修复

2026-11-08 后续原应用验收发现：SeedWorld 的 startup near profile 先注册
`AIWorld/Ocean`，而原生作者材质也声明该名称并显式引用包含 `WaterFar` 的 Shader。
旧 MaterialLoader 优先命中全局名称，导致跳过显式引用。此缺陷在本次任务开始时的 WIP
已经存在，不属于新的公共 re-export 引入；原应用失败仍按兼容门禁处理。

经协调方转达的条件授权，最小直接依赖修复限定于 Modify 的 MaterialLoader 和 ShaderLoader。
MaterialLoader 优先解析显式 Shader 引用；没有引用、或引用未映射时，继续使用已注册名称。
已映射但无法加载/类型不符的引用仍报错。ShaderLoader 对同名不同源程序使用独立运行身份，
不覆盖既有 Shader；源程序缓存同时区分资源 URL 命名空间与源字节，以免混用相对 include。
`shaderc` 仍采用原有内容身份规则。

旧 `seed-world-water-shader-aot-v1`、湖泊/海洋 near/far 三份 profile、各自 Shader 名称、
原 AOT 字节和启动顺序均保持原样。不要把旧 near-only profile 改为作者双区域资产来掩盖碰撞。
WaterStartup 回归覆盖真实注册顺序、作者 `WaterFar` 消费、查询以及旧 near/far 对象保持；
普通 Material 引用回归覆盖优先级、无引用/未映射引用回退、错类型拒绝与实际 Shader 编译。

本轮 Water archive 沿用 v3 的完全相同字节；升级的是其外部 native Engine/Modify 依赖，标为 v4。
最终消费必须同时遵循 `engine-water-native.pair.json` 的 archive 与 native 目录哈希，不能仅凭
`frozen-v4` 路径判断 Water bundle 内容改变。服务切换由 Editor owner 执行，Engine Agent 不改写
Editor 工作区、不操作其服务。完整 Editor/OasisBE/真实 sandbox 验收由协调方在统一阶段安排。
