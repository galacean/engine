# Ocean 共享表面接入验收

日期：2026-09-10。验证环境：macOS、Chromium、ANGLE Metal / Apple M5 Pro。工作区基线为 `ec5a86d41`，存在其他任务的 Lake/River 修改。本记录只归属 Ocean 接入和必要的共享接口扩展，不将其他任务的美术、散射或河流重构计为本次交付。

## 交付结果

Ocean 的近景和远景都使用真实 `CompiledWaterRenderContractV1`，通过 GeometryAdapter、共享 Appearance 深度／边界／高光、BRDF、RawContribution 和 FinalClosure 完成着色。Gallery 与 SeedWorld 继续使用同一 canonical Ocean Look 和后端，重新生成的三份 Water AOT 与 project 资源引用一起更新。

Ocean 专用部分只提供 Gerstner 几何、近岸场、纹理法线／泡沫／焦散采样及远海能力策略。透光和焦散在共享闭包内接受 Fresnel 与泡沫遮蔽；退役的私有深度指数、Fresnel 指数不再假装支持。初始调参快照从真实 Look 映射，编辑波浪不会覆盖自定义粗糙度、反射强度和深度颜色。


## 验证


| 检查 | 结果与边界 |
| --- | --- |
| Water TypeScript | 通过 |
| 12 个 Ocean／共享／River 定向测试文件 | 121 项通过；最后远海调整后的 3 个受影响文件另跑 48 项通过 |
| 12 个架构测试文件 | 94 项通过，含 GLES100/GLES300 生产 Shader 语义等价性 |
| SeedWorld 契约测试 | 干净 Gallery 副本中 27 项通过，1 项现有启动顺序字符串断言失败，见下文 |
| Ocean、内陆水体、SeedWorld 生产构建 | 通过；使用独立输出目录，未重启共享开发服务 |
| Lake、River 浏览器 | 各自进入可见运行状态，错误和失败请求均为 0；这是共享改动的兼容性抽验 |
| SeedWorld 浏览器 | 三份 Water AOT 请求均为 200，GPU warmup 完成，加载状态 complete，authoritative-hydrology-v1 输入就绪，Ocean 实际可见 |

本地截图和 JSON 证据位于仓库 `output/playwright/ocean-unification/`：`final-island.png`、`final-shore.png`、`final-horizon.png`、六张诊断图、`browser-final.json`、`compat-lake.png`、`compat-river.png`、`seedworld-visible.png`、`seedworld-acceptance.json`。

## 成本与能力边界

- Ocean 详细路径实测诊断为 5 draw、211,200 三角形、107,204 顶点，持有 GPU 资源 5,421,276 字节，不进行每帧网格上传。该计数不能作为 GPU 耗时或帧率提升证据。
- 近景为正确保留未位移场景颜色，opaque color 采样从 1 次增加到 2 次；场景深度仍为 2 次。没有新增渲染目标。
- 远海保持最多 2 次纹理采样，不读取场景颜色／深度。反射方向和 Fresnel 使用一致的未解析法线方差近似；低机位最远处仍表现为较平滑的色带，未宣称与完整近景逐像素等价。
- 受限透光与粗糙透射按显式策略组装，默认 Lake/River Shader 不包含这两项附加代码。没有增加新的几何表达，也没有引入并行的 Ocean 私有最终着色链。
- 未做移动真机、GPU timer 或热稳定性测试，不宣称 GPU 性能提升。

## 公共门禁与归属

1. `WaterShaderCompilationBudget` 的 3 项旧基线预算仍失败：River expanded source 比率 1.2788、River local map 1.2940、Heightfield High/12 1.0485，对应上限 1.024、1.024、1.026。工作区同时包含 River／共享散射变更，不能把整体差额归因于 Ocean；未修改预算阈值。Ocean 新增的可选代码默认不进入内陆 Shader，已有针对性测试约束。
2. `SeedWorldShaderWarmup.spec.ts` 的启动顺序检查在 HEAD 中查找连续字符串 `authoritativeGenerationWorker.build`，而 HEAD 的源码在点号前换行，返回 -1。本次未改动该启动文件或该断言；实际生产加载与预热已另外验证。
3. `verify:isolation` 报告现有已提交的外层 skill／粒子等路径超界，输出的 Working changes 为空。本次工作变更仍在 world 下，未修整无关历史。
4. 共享物化目录的 `gallery:sync` 不删除旧 AOT 哈希文件；为避免重建共享 Engine 中断其他任务，资源唯一性检查在独立干净 Gallery 副本完成。权威源码中仅保留当前三份 shaderc 和一份 manifest；生产构建按 project 的新引用加载。

因此，Ocean 接入、案例交互和生产运行验证已完成；公共预算与隔离门禁不能报告为全绿。未执行 commit、push、PR 或部署。

> 2026-09-10 测试精简说明：上述 Shader budget 失败是历史记录。该性能预算测试及入口现已删除，三个代表变体改由 `WaterShaderCompilation.test.ts` 只检查预编译正确性；没有沿用或调高历史预算阈值。
