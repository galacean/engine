# 农场 SSR Surface 修复与验证

2026-11-07，Issue [galacean/engine#3156](https://github.com/galacean/engine/issues/3156)。审查与实测基线为 `warm-cheetah` 的 `88c4326e0` 加任务开始时已有的未提交农场迁移改动；没有切换分支或合入 Issue 所述的其他 SSR 改动。

## 结论与边界

核心问题成立，显式接收或克隆继承时真实可达。默认农场没有注册这些接收者，所以本次不是默认画面已经发生 SSR 错误的证明。

- `PlantOrganTint` 的 Forward 将顶点色固定为 1，把 `COLOR_0.a` 作为器官遮罩；通用 Surface 却把它乘进纹理 alpha 和 albedo。alpha cutoff 与金属 F0 因此可能不一致。
- `SoilMoisture` 还修改湿度颜色、粗糙度、覆盖与 discard，通用 Surface 不包含这些计算。
- `ItemRimLight` 实际已还原普通顶点色语义，且只向最终 radiance 添加边缘光，不能直接断言它具有同样的遮罩/F0 缺陷。这里随其基类采用统一保守接收策略，符合 Issue 的方案 A；需要它接收反射时应单独声明并验证契约。

采用方案 A：从基类移除通用 Surface UsePass，派生 shader 自动不再提供接收契约；删除 HarvestDissolve 已无作用的移除语句。复用公共 capability/接收判定，不增加 Engine 特判、不清空克隆来的作者设置。普通 PBR 接收能力保持原状。没有实现新的湿土反射功能。

## 可重复回归

```sh
TEST_GROUP=farming-migration pnpm exec vitest run --config world/scripts/acceptance/unit.config.mjs
```

`FarmingSSRSurface.spec.ts` 使用实际 ShaderCompiler、Shader 注册与公共 capability 查询。修复前植物、湿土、道具 3 条失败；收获与普通 PBR 对照通过。修复后新增 5 条全部通过，农场测试组共 5 文件、38 条通过。检查派生结果而非只匹配源字符串，保留 Forward/DepthOnly/ShadowCaster，并拒绝通用 Surface。

## WebGL 前后对照

入口：`/world/tests/farming/ssr-surface.html`。旧实现下加 `?baseline=1` 采集基线；修复后使用无参数入口。两个阶段均使用 Paseo 原生浏览器和当前工作区 Vite 服务，实际 WebGL2。所有 10 个案例均通过，结束后立即关闭各阶段的任务标签，最终清单为空。

每个案例创建 50 个可见网格，绑定生产 shader、真实 cutout 纹理、COLOR_0、金属材质输入、湿度参数。依次检查显式注册、运行注册后 cloneTo、作者 On 设置后 cloneTo；普通 PBR 为正对照。共享网格与材质由 Engine 自动合批，因此 50 个对象对应 1 个接收批次。它是 50 个表面提交夹具，不是完整 50 块农场的 GPU/玩法性能验收。

| Shader | 路径数 | SSR Surface 提交 / 帧 | SSR 开启时实际 GL Draw Call / 帧 | SSR 关闭时实际 GL Draw Call / 帧 |
| --- | --- | --- | --- | --- |
| PlantOrganTint | 3 | 1 → 0 | 6 → 2 | 2 → 2 |
| SoilMoisture | 3 | 1 → 0 | 6 → 2 | 2 → 2 |
| ItemRimLight | 3 | 1 → 0 | 6 → 2 | 2 → 2 |
| 普通 PBR | 1 | 1 → 1 | 6 → 6 | 2 → 2 |

Draw Call 由四个原生 GL 绘制入口计数，Surface 提交数取公共 SSR metrics。修复后的农场接收数为 0，inactiveReason 为 `no-compatible-receivers`，预热列表也不再包含 Surface；普通 PBR 仍能注册与绘制。所有帧检查 GL error。

关闭 SSR 后读回 Forward 帧，修复前后全部 10 个案例的可见像素数与哈希一致：PlantOrganTint `2412549894`、SoilMoisture `1843876375`、ItemRimLight/PBR `2358823687`。这些结果只证明该固定夹具的图像与提交行为，不代表完整游戏或跨设备像素等价。

原始采集位于忽略目录 `world/.acceptance/farming-3156-baseline.json`、`world/.acceptance/farming-3156-fixed.json`。

## 本轮检查

- Node 全组：38 条通过。
- `node world/scripts/typecheck.mjs`：通过，Engine 基线既有 1 项诊断，无新增诊断。
- `node world/scripts/check-boundaries.mjs`：通过。
- `WORLD_DEMO=farming/native-preview pnpm --dir world build`：通过，既有大 chunk 警告。
- `git diff --check`：通过。
- 补充类型检查：临时扩展同一 World 类型检查的根文件，纳入两个新增测试 TS，沿用原有 Engine override host；通过。常规 World 配置仅包含 demos，不能把它单独解释为测试文件已通过类型检查。
- `pnpm exec eslint packages/farming/src/farming/presentation/PlantHarvestShader.ts`：通过，无警告。仓库 ESLint 配置只覆盖 packages 源码，新增测试由补充类型检查及 Prettier 检查覆盖。
- 新增两个测试 TS 与 HTML 的 `prettier --check`：通过。

本轮结束前比较任务起始快照：仅上述两个产品代码文件和包 README 的已跟踪内容发生本轮变化，任务开始时已有的未跟踪文件全部保持不变。临时 Vite 服务已停止。

未验证手机、GPU 帧耗时、完整农场场景或新增湿土反射效果。未提交、推送、部署，未评论或关闭 Issue。

## 本轮文件

- `packages/farming/src/farming/procedural/runtime/PlantOrganTint.shader`
- `packages/farming/src/farming/presentation/PlantHarvestShader.ts`
- `packages/farming/src/farming/README.md`
- `world/tests/farming/FarmingSSRSurface.spec.ts`
- `world/tests/farming/FarmingSSRSurfaceAcceptance.ts`
- `world/tests/farming/ssr-surface.html`
- 本文档。


## 2026-11-17 上游同步复核

已快进到 `experimental/engine-next@dec433626081cfe103985f044b69e5d2bfffecaf`。恢复本地修复之前，使用本轮 ShaderPrecompiler API 对纯上游运行相同五条编译/capability 断言，结果为三条失败、两条对照通过：上游仍未修复 #3156。

保留本地修复后，农场 Node 五文件 38 条通过，SSR 五条包含其中。Paseo WebGL 验收十组通过：九个农场路径 Surface draw 均为 0，PBR 为 1；农场 Forward/SSR draw 均为 2，PBR 为 2/6。Forward 哈希与前述夹具结果一致，GL error 断言通过。标签观测结束立即关闭。

SSR spec 仅适配上游公开 `ShaderPrecompiler.setIncludeMap/precompile`，未降低断言。Seed World build 通过；类型检查仍有纯上游已复现的 22 项 PrimitiveMesh 调用签名诊断，无新增；包边界检查仍有两项未修改的上游引用违规；`git diff --check` 通过。本轮没有重新运行 ESLint、手机、GPU 性能或完整玩法验收，也没有发布 Issue 评论或关闭 Issue。
