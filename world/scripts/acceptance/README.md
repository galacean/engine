# 迁移验收

本轮 Seed World 旧工程植被恢复与岩石颜色回归已独立保存在本仓库，不依赖相邻来源测试目录：

```sh
pnpm --dir world exec vitest run --config scripts/acceptance/seed-world-fixes.config.mjs
```

该入口执行 `world/tests/seed-world` 的用例，其中依赖 Demo 的测试留在这里，其他测试放在对应包的 `packages/<name>/tests`。根目录 `vitest` 统一运行这些测试。首次运行前先执行 `pnpm --dir world prepare:engine`，它生成测试依赖的 shader 缓存；修改 shader 替换文件后要重跑。这里原有的 6 个来源用例仅调整迁移后的模块和资源地址，覆盖旧工程保存重开、植被闭包、主岩体与小石头调色隔离、颜色面板和项目关闭。它不替代下述全量迁移验收。

原项目默认位于相邻的 `engine-next`；原始源码为 `world/gallery`，可运行基线为 `world/.materialized/engine/world-gallery`。证据写入已忽略的 `world/.acceptance`，不发布到 Demo。

- `prepare-tests.mjs`：复制原测试和夹具；业务实现通过迁移映射链接到新仓库，不回退到旧实现。
- `adapt-tests.mjs`：仅调整目录、包归属和构建配置相关断言；全部适配记录在 `test-adaptations.json`。
- `unit.config.mjs` / `modified-engine.config.mjs`：系统 Node 单测与修改层 Chromium 单测。
- `run-terrain-batches.mjs migrated|baseline`：保存逐文件结果；`FAILURES_ONLY=1` 只对照失败的旧项目用例。
- `unit-status.mjs`：仅汇总历史结果至 `unit-status-historical.json`，其中包含已撤回的修复，不用于当前验收。
- `check-assets.mjs`：核对迁移映射、资源清单和包资源归属。
- `serve.mjs baseline|migrated`：分别在 5191 / 5192 启动验收服务，附加仅用于观测的 Engine CPU 采样。
- `build-production.mjs baseline|migrated`：原项目支持的 Seed World 生产构建，以及迁移后全部 40 静态入口的生产构建。
- `serve-production.mjs baseline|migrated`：分别在 5195 / 5196 提供上述产物。
- `browser-status.mjs [证据目录]`、`contact-sheet.py [证据目录]`：汇总逐页数据、生成对照缩略图；后者需要 Pillow。
- `compare-demos.mjs`：按 `world/demos.json` 逐页运行 A/B；`DEMO_FILTER` 筛选，`RERUN=1` 重跑。

浏览器采样必须在单测和构建结束后执行。每页预热后采样三个 5 秒窗口，记录帧间隔、Engine.update CPU、绘制调用、浏览器任务时间、堆、错误和截图。这些指标不等于 GPU 执行时间。除 SSR 的固定时间/相机截图外，动画时间未同步，像素差不能独立证明渲染回归。

测试视图中的旧生成器测试可能改写资源；运行后必须把生成器影响的素材恢复为原始输入，并重新核对基线文件哈希。不得修改原项目工作区、替换断言为恒真，或把未加载/超时/缺少外部输入的用例计为通过。

生产 Seed World A/B 使用 `DEMO_FILTER=demos/seed-world/index.html BASELINE_ORIGIN=http://127.0.0.1:5195 BASELINE_ENTRY=index.html MIGRATED_ORIGIN=http://127.0.0.1:5196 ACCEPTANCE_BROWSER_DIR=browser-production`。

迁移后全部生产入口的就绪检查使用 `DEMO_MODE=static ACCEPTANCE_VARIANT=migrated SMOKE_ONLY=1 MIGRATED_ORIGIN=http://127.0.0.1:5196 ACCEPTANCE_BROWSER_DIR=browser-production-smoke`。这是加载/画面检查，不采集有效的性能窗口，也不是原项目全 Demo 的生产 A/B 证明。

原始 Gallery 没有覆盖全部 Demo 的统一生产构建，不能把它的开发入口和迁移后生产入口混为同一性能基线。外部服务、真实 LLM、Blender 和物理移动设备需要单独条件；默认页面可见不代表完整链路通过。

补充验收入口：

- `native-material.config.mjs` 在 modify 环境执行 5 条原生加载/有效性测试与 10 条旧材质兼容及失败清理测试。显式筛除 3 条未知字段拒绝测试和 1 条 Shader 重复创建拒绝测试：它们与修改层旧契约不同。原生完整 9 条必须在不加载 modify 的环境单独验证；筛除不计通过。
- Agent Trace 自动导入原测试的离线 fixture，验证 6 条记录；不调用 LLM。建筑 generated/native-access/presets/validation 自动点击内置验收按钮并记录结果。
- `DEMO_FILTER=demos/wind-tree/benchmark.html DEMO_QUERY='?trees=1000' WIND_GATES=1 RUN_TIMEOUT_MS=600000` 运行真正的千树 B/P3/B 与 OFF/ON/OFF 门禁。GPU timer 不可用时，内置 passed 不能解释为 GPU 已验收。
- `REVERSE_ORDER=1` 反转 A/B 顺序；重点性能复测要串行执行，不能和单测、构建并跑。
- `build-production.mjs baseline-integrated` / `serve-production.mjs baseline-integrated` 提供原项目综合世界生产入口（5197）。对比使用 `BASELINE_ORIGIN=http://127.0.0.1:5197 BASELINE_ENTRY=index.html`。
- 检查截图和 canvas 实际尺寸；ready、绘制调用数及无控制台错误不能独立证明画面可见。

`node --test world/scripts/acceptance/WorkerAssetUrl.test.mjs` 构建并启动真实 classic Worker，验证主线程/Worker 的同一资源 URL、动态依赖文件及根路径/嵌套部署。


2026-11-04 口径更正：只恢复 engine-next 与迁移版的差异。不要修来源既有算法，不修改原断言或夹具来获得通过。这条规则只约束从 `engine-next` 重新生成的本地来源一致性验收；已搬入各包的测试是当前行为的测试，随实现一起维护。

- `audit-source-parity.mjs`：按全部迁移映射核对来源工作区、物化快照和目标；报告是差异定位证据，不等于渲染/性能证明。
- `run-source-parity-unit.mjs <文件名...>`：以原断言逐文件串行运行来源和目标，保留独立日志、JSON、运行状态和未完成前最后用例；进程超时只记未完成。
- `source-parity-*` 证据是撤回额外修复后的续验结果。此前的 `continuation-*` 不能直接用于声明当前版本通过。

干净旧主线复核后，基准必须区分 `engine-next/dev/2.0@039cbdcf`（引擎 `bd34daa`）与实验工作区（引擎 `5cac8daa`）。共同失败不能直接证明旧主线已有缺陷。用户要求修复旧主线没有的新增问题；MaterialLoader 已按旧基线恢复忽略未知字段，仅在 modify 生效。后续来源一致性审计应显式保留这项有依据的差异。
