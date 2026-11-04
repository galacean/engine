# 按 engine-next 原逻辑对齐（2026-11-04，本轮验收）

> 2026-11-04 原仓库直接复验更正：三个 Demo 与 51 条 Vitest 失败均由原入口复现；AssetEntrance 为 3 通过、7 失败。此前建筑 13 个失败记录中的 6 个 ENOENT 来自验收 cwd 错误，不能全部归因来源。原 Masonry runner 为 43/4；shared 两文件在仅补 TS 路径解析后为 18/4。详见 [原仓库失败诊断](original-failure-diagnosis-2026-11-04.md)，以下旧统计保留为历史记录。

本记录取代此前“修好来源既有失败也算迁移验收通过”的口径。用户要求：所有修复（包括此前修复）必须先核查 engine-next 的代码、资源和运行条件；只恢复迁移引入的差异，不重设来源算法、容错、默认配置或单测预期。

## 已撤回

撤回清单和完整代码备份保存在 `world/.acceptance/withdrawn-behavior-fixes`，失败日志和历史测试结果保留。

- 道路尾部的采样几何匹配、`bend` 到物理曲线的新接线及几何版本递增。
- 村庄坡地 A* 后备寻路。
- 湖泊简单编辑分类器对 ID 名称的扩展。
- `forceFull` 绕过共享水体缓存的新增行为。
- 岩石数组引用复用、新农场请求从空间编辑缓存键中排除。
- Cottage 门洞中心精度改动、建筑 Worker 的错误消息扩展。
- 空水面特殊处理、Metrics Zoo 等待发布和激活视图的新增逻辑。
- Cute Zoo 删除 `autonomy.cycles` 的数据修改。
- MaterialLoader 对 `Select` / `Toggle` 的额外兼容。
- Tree Reconstruction 在 production preview 新增 API 的行为。来源只在开发服务器提供 API，保持其服务边界。
- 修改层 WebGLEngine 的额外构造函数，以及 ShaderLibrary 来源没有注册的 InheritVelocity 项；原始 World Shader 索引恢复，仅保留用户明确要求的 Gaussian Splat 排除。
- 对旧测试的默认时长、配置、预期值、错误文本、fixture 接口等行为性适配。测试重新使用来源断言；目录/包名/构建入口适配仍显式记录。

此前的 163 条建筑全绿、109 条 UI/岩石全绿、9 条语义规划全绿等结果包含上述已撤回代码或夹具，属于历史诊断，不能作为当前验收通过证据。

## 保留的迁移适配及依据

| 范围 | 来源机制 | 迁移适配 |
| --- | --- | --- |
| 引擎构造 ABI | 原项目消费 ES5 release 构建，toolkit 以 `.apply` 调用 Script | 修改层沿用 ES5 ABI；实际 WebGLEngine + OrbitControl 测试通过 |
| Renderer 导入 | 原项目打包产物能正确初始化 ShaderMacro/ShaderProperty | 源码加载时改为同一导出的直接路径，避免 barrel 循环；不改渲染算法 |
| Shader 编译 | 原项目使用 release compiler 和 overlay 的原始 Shader 输入 | 使用相同 release 模式及修改层 Shader 原文，不执行 TS 中调试条件块 |
| 粒子依赖 | 原项目粒子模块与对应的 GLSL 一起发布 | 把对应来源 GLSL 纳入 modify，避免混用 dev/2.0 的新布局 |
| Worker | 原项目内联 Worker 使用 IIFE/classic 契约 | 恢复 IIFE；主线程/Worker 发布同一 JSON 资源身份，Worker 使用自身 location |
| 资源闭包 | 原 Gallery 静态目录和发布插件提供动态引用的资源 | 资源移至所属包；显式 URL 引用、同一文件保留路径发布，保持原资源字节 |
| Brotli | 资产加载器自行解压 `.br` | 服务不再额外进行 HTTP 解压，保持加载器收到相同字节 |
| 虚拟文件路径 | 来源识别 `../` 为相对路径 | 撤销迁移误把字符串前缀改成包目录的错误，恢复来源判断 |
| 建筑资源 | 来源使用 `../assets/native/` 加清单文件名 | 恢复迁移漏掉的 `/` |
| Demo 私有入口 | 原动物两个 HTML 各自选择自己的配置包 | 入口显式提供相同 JSON URL，以便新生产构建收集文件；不改变注册数据 |
| 历史建筑服务 | 来源 Renderer 实现已经位于 offline，旧 HTTP 地址失效 | 映射到迁移后同一 Renderer 文件；来源 A/B 也只用 HTTP adapter 修正地址，保留原源码 |
| 包边界 | 用户要求共享系统归包、Demo 不互相依赖 | 地形数据/GLSL 归 terrain；建筑验收用自己的模块注册入口，继续注册同一公共类 |
| Gaussian Splat | 用户明确不迁入 | 保留排除，其他 source 行为不因此改动 |

## 本次发现的确定迁移差异

1. 两份资源 catalog 的 `textures` 对象键被迁移字符串重写成 `./textures`。已恢复来源键名。
2. Ocean 编码器把目录 URL 重写成 `index.ts`；农场知识生成器和 Agent Trace 校验目录 URL 漏了末尾 `/`。已恢复目录语义。
3. 植物离线编译器、Agent 声明工具的 SSR 模块入口被改成了与 Vite root 不符的相对路径。已按迁移后的真实模块地址恢复。Agent 生成器同时保留来源输出根目录机制，只适配输出目录；撤销中途删除该机制的做法。
4. Agent Trace vendor 产物被无必要地修改了类型导入，且漏迁两份 source map，破坏原 manifest 的完整性校验。已恢复来源产物并补齐原 source map，原 manifest 未放宽。
5. Agent 导出的 `.d.ts` 内部路径没有搬动，恢复来源原文，移除不必要的 `.d.ts` 后缀重写。

6. Seed World 的“查轨迹”仍按旧页面层级定位。已适配主入口与 `dev/planning` 入口，真实组件点击及目标 HTML 请求通过；部署前缀保留已校验，前缀部署服务未另搭建。
7. 农场声明生成器把交互类型限定到了错误的 farming 包，应为 project 包。恢复来源的类型收集范围，原 104 个声明生成结果与来源逐字节一致；生成文件恢复原格式。
8. Agent 的 40 份 `api/tools/*.d.ts` 漏迁，`api` 全局忽略还隐藏了声明目录和农场源码 API 入口。已补齐来源字节、补入映射，并解除该目录的忽略；Agent 原始 `--check` 两侧均成功。

## 新证据

- 修改层：308 条 / 20 文件通过，包含 ES5 toolkit 真实浏览器用例。证据 `source-parity-modify-unit.json`。
- Agent Trace：来源与目标均执行原 vendor 完整性检查通过，固定 commit `687f282e8625c6b8d11ff58211a90524be2e4317`。
- 离线植物编译：同一真实示例树配方，两侧几何 JSON 402709 字节完全一致，SHA256 `58b690f38af750794e8519a9bb39f9b079c3a62a6f399e1faf2da2d66f0daeda`。
- 包边界及 4389 条映射、854 个资源引用检查通过；原生 packages/examples 对 dev/2.0 基线无修改/删除/重命名。
- 全量审计 4389 个映射文件：3149 字节相同，1200 仅格式/类型/模块地址归一后相同，40 项人工说明的目录、资源、构建和 Gaussian 排除适配；来源工作区与物化快照未发现已迁文件漂移。`audit-source-parity.mjs` 全量比较原文件与目标，区分字节相同、仅格式/类型/模块地址差异以及需人工说明的差异。它用于定位差异，不能替代运行时/性能证据。
- 来源原始 `world/gallery` 与验收物化快照对已迁入文件未发现内容漂移。

- 原断言 15 文件 A/B：14 文件完整，两侧均 89 通过、51 失败，逐用例结果零差异；`AssetEntranceEffect.spec.ts` 两侧 120 秒未完成，不计通过。证据 `source-parity-units/summary.json`。
- 建筑原 Node 测试及真实 fixture：两侧均 147 通过、13 失败，0 skip/cancel；失败包含 gothic-binding 加载失败，不全是断言失败。
- 40 个静态入口完整生产构建通过；类型检查无新增诊断（原生已有 1 条）。
- 农场与 Agent 生成工具原始 `--check` 两侧通过。
- 旧 `unit-status.mjs` 改为显式输出历史账本，包含撤回修复的旧通过数不混入当前验收。

## 本轮浏览器与性能验收

40 个静态入口逐页对照已完成，最新有效结果为 **37 个入口及已执行检查正常，3 个来源与目标共同失败**。这不是全部交互/外部服务链路的通过声明。两套历史建筑服务也复验完成，未发现新增单侧运行失败。

共同失败保持来源行为，不再加兼容分支：

- Cute Zoo：`Invalid animal species: bull`，注册数据与 schema 的现有不匹配。
- Day/Night：`MaterialLoader: unsupported shader data type "Select"`。
- Metrics Zoo：`OceanWaterCompileError: $.wetSource: Ocean render field has no wet texels.`。

有效结果总账：`world/.acceptance/source-parity-current-summary.json`。逐页原始证据来自 `source-parity-browser`、`source-parity-recheck` 和 `source-parity-animals-loaded`，总账保留每页来源路径。`source-parity-current/contact-1.jpg` 至 `contact-7.jpg` 汇总全部 40 个入口截图，已逐页目检；正常加载页面未见新增的结构、材质或布局差异。动画时钟未锁定，不能据此声称所有动态像素完全相同。

- SSR 固定时间与相机：两侧 PNG 字节相同。
- 建筑默认场景 12 项、预设 35 项、原生访问及完整验证均实际点击运行；完整验证的 20 项结果（含非法输入拒绝和撤销）两侧完全一致。
- Agent Trace：导入原离线 fixture，6 条记录在两侧保持可见，未调用真实 LLM。
- Resident、Masonry：使用真实资源，执行换材/隐藏/恢复/像素审计；两侧画布分别为 768×768、398×398，逐像素一致。帧间隔 p95 16.7–16.8 ms，回调 CPU p95 约 0.1–0.2 ms。对原生捕获的 coverageMismatch 623 等误差两侧相同，并非绝对原生还原通过。

### 性能复测

同机 Metal、1280×720 页面视口、DPR 1，按来源实际 canvas 分辨率执行。采样时没有并行运行本任务单测/构建/全量扫描；机器仍有其他项目进程，不代表独占硬件。

| 场景与模式 | 来源 CPU 中位数 | 迁移 CPU 中位数 | 说明 |
| --- | ---: | ---: | --- |
| Seed World 生产 | 3.4 ms | 3.1 ms | CPU p95 均约 5.9 ms；帧间隔 p95 均约 16.8 ms |
| 综合世界生产 | 7.7 ms | 7.2 ms | 帧间隔都有明显波动，p95 均约 166.6 ms；无持续迁移侧变慢证据 |
| 综合世界开发复测 | 7.6 ms | 6.7 ms | 首轮 8.0/7.3 ms；与此前迁移侧变慢的方向不一致 |
| 动物 100 个全部加载 | 5.7 ms | 5.1 ms | 每帧均 117 draw；帧间隔 p95 均约 16.7 ms |
| 规划入口开发复测 | 3.9 ms | 3.5 ms | 首轮 3.4/3.8 ms，差值未持续 |
| 植物预览 | 4.7 ms | 4.8 ms | 两侧就绪且无错误 |
| 体积云 | 0.7 ms | 0.7 ms | 两侧就绪且无错误 |
| 农场主场景复测 | 0.5 ms | 0.7 ms | 首轮 0.6/1.1 ms；仍有小幅 CPU 差值 |
| 风雨复测 | 0.5 ms | 0.9 ms | 两轮约 +0.4 ms；帧间隔 p95 均约 16.7 ms，未自行优化来源逻辑 |

千树专项两侧原生门禁 `passed: true`，风开关对比 `valid: true`。GPU 使用 `EXT_disjoint_timer_query_webgl2`，每阶段 255 个有效样本、0 disjoint；Hero GPU 中位数来源 19.315 ms、迁移 19.131 ms；开风 GPU 中位数来源 18.892 ms、迁移 19.196 ms。两侧每帧均 42 draw、4,240 instances、2,683,866 triangles，GPU 内存 22,524,786 bytes。证据 `source-parity-wind-1000/demos-wind-tree-benchmark-html.json`。

完整指标见总账及 `source-parity-production`。这些结果支持主要已验证场景没有持续明显性能退化，不能写成所有指标完全一致。农场/风雨的小幅 CPU 差值和同机波动应保留。

### 无效样本和处理

- Agent 生成器运行的 Vite 实例与验收 dev server 共用缓存，导致旧进程请求 `esbuild-wasm` 返回 504。重启验收服务后默认建筑和原生访问两侧通过；旧失败保存在 `source-parity-browser/before-dev-server-restart`，未修产品编译器。
- 植物/体积云出现超时，海岛来源下载纹理解码器时出现 `ERR_INTERNET_DISCONNECTED`；三页串行复跑两侧正常，旧记录保留。
- 一轮动物采样只加载 40/46 个角色，性能样本无效。验收脚本增加等待原页面报告 100 个角色全部加载，再预热 10 秒的条件。最终有效样本两侧均 100 个、117 draw，不更改产品行为。
- 复测顺序按每条 JSON 的 `runs` 为准；筛选子集时的交替索引已修正为同模式完整清单的稳定索引，不能笼统声称历史子集全部反向。

### 验证边界

- 全部静态入口生产构建成功；生产运行/性能 A/B 本轮重点验证 Seed World 与综合世界，不能等同全部 40 个生产入口的完整功能回归。
- 原始单测仍有共同失败和一个共同超时；没有修改断言、夹具或来源算法使其全绿。
- 真实 LLM、AI Chat 外部请求、语音、物理移动设备未在本轮完整验收；Agent Trace 的离线数据导入不能替代这些链路。
- Blender 完整树木重建缺少对应原始白桦/枫树输入；已有 FBX 的大端格式也被 Blender 拒绝，不能声称重建成功。保留来源只在 dev server 提供重建 API 的边界。
- 演示页的默认画面及部分内置验收不覆盖每一个交互组合。

原生 dev/2.0 与来源快照还存在 Shader.compileVariant、DynamicCollider 和 ASTC 能力检查三处上游版本差异；这不是本次修改。原生文件保持用户要求的 dev/2.0，相关影响需要由运行证据判断，不能把“未修改原生”写成“所有原生字节与来源相同”。
