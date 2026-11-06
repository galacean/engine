# Seed World Agent 最终架构备忘

本文记录当前实现必须长期保持的边界和不变量。它描述的是最终协议，不是迁移兼容层。

## 1. 调用链

```text
用户指令 + world_thumbnail + 最近 5 个任务结果
  → 单一 Agent 通过原生 Tool Calling 调用 api_search / execute，或直接回复
  → 缺少声明时，api_search 加载当前任务所需的 TypeScript 声明及公共依赖
  → execute 编写并提交一段 Agent Script
  → AgentScriptCalling 在全新执行上下文中运行 main()
  → Zod 校验 API 输入
  → SeedWorldAgentApplication
  → SeedWorldEnginePort / World Authoring 事务
  → Zod 校验 API 输出
  → main() 返回有界阶段结果
  → 同一 Agent 读取带 tool_call_id 的 Tool Result，继续调用 Tool 或直接回复
```

每次模型调用都使用同一个 System Prompt 和同一组原生 Function Tool，不经过独立 Intent 或 Completion Workflow。
系统逐轮驱动应答式 Agent；每次模型调用只调用当前下一步的一个 Tool，任务完成时返回普通 Assistant 文本。
模型通过 `api_search` 和 `execute` 的 Tool arguments 提交参数，不返回自定义 `final`、`reply` / `read` / `write` 分类或业务 JSON 决策对象。
Runtime 根据脚本实际引用和调用的 Tool 及其校验后回执判断副作用；Tool 自身的 `read` / `write` 元数据不进入模型返回协议。
APISearch 是 AgentLoop 处理的规划 Tool，不是世界 API；`api_search` 和 `execute` 使用原始 Assistant Tool Call 与匹配 ID 的 Tool Result 进入下一轮上下文。
API 原始大列表、局部变量、过滤过程、日志和运行时内部对象不进入下一轮模型上下文。

## 2. 契约真源

- Zod 注册表是资产结构、API 输入、API 输出和语义说明的可执行唯一真源。
- 生成器必须把每个公开 Tool 和每种具体持久资产分别投影为独立 `.d.ts` 模块；只有被多个模块共享且语义完全相同的基础结构才能生成 `common` 模块。仅属于一个 Tool 的输入、输出和辅助结构必须内联在该 Tool 声明中。生成模块只能由生成器产出，不允许手改。
- 固定 System Prompt 携带 `Asset Type | Asset Domain | APISearch Symbol` 资产路由表和“能力 → APISearch Symbol”API 路由表。
- 资产表只陈述公共协议中的精确值，不维护自然语言同义词。模型直接理解玩家意图，再把它映射为 `Asset Type` 或 `Asset Domain`。
- APISearch 只接受表格中的精确入口符号。入口符号定位对应 Tool 或资产的 `.d.ts` 模块，随后按 TypeScript 模块解析规则递归加载真实 `import type` / `export type` 依赖，合并完整声明闭包并去重；禁止维护第二份手写 `dependencies` / `requiredSymbols` 语义依赖表。
- APISearch 以完整 `.d.ts` 模块为最小返回单位，不能在类型或函数声明中间截断。同一任务内已经加载的模块累积保留，后续搜索只补充尚未加载的模块。
- 每个 Tool 声明必须直接表达它的真实输入和返回依赖。
- `world.query` 返回公共 `Asset` 查询投影，不加载具体资产详情；`Asset.type` 是公开判别字段且必须等于 `Asset.ref.kind`，`distanceMetres` 只属于查询投影。
- `world.inspect` 通过 `AssetDetailsByType` 将输入 `ref.kind` 映射到具体资产类型。具体资产声明独立增强这张映射；模型根据查询结果的 `type` 从目录读取对应 `/assets/*.d.ts` 后即可获得精确返回类型。
- 不允许通过 `JsonObject`、手写依赖表或首次执行失败来隐藏、猜测具体资产字段。
- Tool 声明模块被 APISearch 加载后才绑定对应的运行时 API；仅加载资产或共享类型不会隐式开放新的运行时 API。
- 每次 API 调用仍由 Zod 校验；`.d.ts` 只负责让模型准确理解，不取代运行时校验。

目标声明布局如下：

```text
contracts/generated/api/
├── tools/
│   ├── world.inspect.d.ts
│   ├── water.create.d.ts
│   └── ...
├── assets/
│   ├── TreeAsset.d.ts
│   ├── ForestAsset.d.ts
│   ├── LakeAsset.d.ts
│   └── ...
└── common/
    ├── Asset.d.ts
    ├── QueriedAsset.d.ts
    ├── Ref.d.ts
    ├── Pose.d.ts
    ├── Bounds.d.ts
    └── ...
```

例如，模型通过 APISearch 加载 `world.query` 后，真实 import 闭包会带入 `QueriedAsset → Asset → Ref / Bounds / Relations`，不需要加载任何具体资产。
查询返回 `type: "lake"` 后，模型再搜索 `LakeAsset` 与 `world.inspect`，不会把其他 24 种资产详情放入上下文。
`water.create.d.ts` 仍直接内联创建参数与返回结构，只 import `Ref`、`Target`、`Bounds` 等真正共享结构。
重复搜索同一符号是幂等的，当前任务的已加载模块集合只保留一个规范化模块 ID。

## 3. 世界资产模型

持久资产只有 25 种：

- terrain：mountain、hill、ridge、canyon、valley、slope、plateau、basin；
- water：ocean、lake、pond、river、stream；
- vegetation：tree、forest、shrub、shrubland、grassland、flower-field、aquatic-grass-bed；
- object：rock、mushroom；
- infrastructure：road、bridge；
- poi：poi。

`Ref` 必须包含稳定 `id`、`domain`、`kind` 和 `source`。`source` 只能是 `natural` 或 `authored`。运行时版本不属于 Ref 身份；只要资产尚未删除，同一个 Ref 就可以跨无关的 World Revision 直接复用。自然生成内容和玩家创建内容都通过同一个 `SeedWorldAssetManager` 投影给 `world.query` / `world.inspect`。

`world.query` 分页返回统一公共 `Asset` 投影：`type`、`ref`、可选 `position`、`bounds`、`tags`、`relations`，以及查询上下文专属的可选 `distanceMetres`。
查询结果不携带具体 `properties`。
`world.inspect` 接收查询、修改结果或历史结果中的稳定 `Ref`，直接返回与 `ref.kind` 对应的具体资产；`result.type === input.ref.kind` 且 `result.ref.id === input.ref.id`。
每种具体资产独立声明，类型专属字段位于 `result.properties`。
模型的证据链固定为 `query item.type → APISearch 具体资产符号 → inspect(item.ref) → 具体 properties`，不存在 `item` 包装层、模糊 `JsonObject` 或运行时失败后的猜测性补搜。
`main()` 仍必须返回有界的最小充分结果。

单棵树和单株灌木是原子资产；树林和灌木丛是区域父资产，成员通过 `relations.parent` 指向父资产。草地、花地和水草区本身就是最小区域资产，不物化单株。高度、坡度、湿度和实时水域位置不是资产，由 `spatial.search` 从最新运行时数据计算。

`terrain.patch` 是一次局部高度场修改，不产生可查询资产。
没有局部删除原子能力的自然地貌、水系或基础设施必须通过结构化 Tool Error 抛出 `NOT_EDITABLE`，禁止把失败伪装为成功返回值。

## 4. API 边界

公开 API 固定为 21 个：

- world：query、inspect、delete、tag.update、selection.save、selection.get、undo；
- spatial：search、resolve、teleport；
- time：get、update；
- atmosphere：get、update；
- terrain：patch、create、update；
- water：create、update；
- vegetation：create、update。

查询和删除不为每个领域复制 API。创建和更新使用领域 API，因为地貌、水系和植被拥有不同的不变量。只有 `spatial.teleport` 可以改变玩家 Pose；任何世界编辑都不得隐式改变玩家 X/Z 或朝向。

`world.query` 的展示 `limit` 只约束返回条目，`matchedCount` 保持准确。单页还受 48 KiB 传输预算约束；`pageLimitedByBytes` 表示字节预算先于条目上限生效，`nextOffset` 必须按实际返回数量推进，脚本可分页穷尽且任何单次 API 回执都不会撞上 Agent Script 的 64 KiB 值边界。`world.delete(selector)` 未显式提供 `limit` 时必须穷尽执行；返回准确计数、事务标识和有界 Ref 摘要，不能把全部对象塞进模型上下文。

## 5. AgentScriptCalling

- `execute.code` 是异步 JavaScript 正文，直接使用 `await`、Console 和 `return`；声明的函数不会自动调用，每次运行使用全新上下文。
- 本任务迄今为止的 `api_search`、`execute` Assistant Tool Call 和对应 Tool Result 进入下一轮原生消息上下文；模型尝试和 Trace 不进入模型上下文；任务结束后全部释放。
- 阶段输出是下一步所需的最小充分信息：单个资产保留稳定 Ref，大集合保留数量/集合 Handle/摘要，批量操作保留 transactionId 和作用范围。
- 只有模型仍需做语义选择时才返回已经确定性筛选和排序过的 Top-K。
- Console 与 Return 独立呈现，展示预算为 64 KiB；超长结果保存为只读输出文件，通过外部 `read` 续读。底层资源上限仍由执行器校验。
- 同一脚本连续产生完全相同的成功阶段输出，表示没有新的模型可见信息。AgentLoop 在第二次相同结果后以 `AgentNoProgressError` 终止，禁止继续重放潜在副作用。任务不设固定步数上限。
- Tool 输入失败、执行失败和输出失败都成为结构化脚本错误，并直接进入下一轮任务轨迹供模型修正。
- `await tools.*` 只解析为 `.d.ts` 声明的成功返回值；应用失败统一通过结构化 Tool Error 终止当前脚本，成功对象不再混入 `ok` 或可选 `error` 字段。
- 成功 Mutation 通过 `status: applied | preview | unchanged` 表达结果；已提交操作必须带稳定 `transactionId`，单资产创建或更新还必须带稳定 `assetRef`，不存在的可选语义值显式使用 `null`。
- Tool 已成功而后续脚本或输出校验失败时，错误必须携带有界执行证据；若证据被截断或失败 Tool 可能已执行，模型必须先查询当前世界，不能直接重放修改。
- Runtime 不做自然语言预分类；模型直接根据用户指令选择 API 并生成脚本。
- AgentScriptCalling 在执行 `main()` 前静态收集 `tools.<namespace>.<api>` 引用：未知 API 返回 `UNKNOWN_TOOL`，已注册但尚未加载声明的 API 返回 `MISSING_API_DECLARATION` 和精确 APISearch 符号；预检失败时整段脚本尚未执行，不能产生半次事务。
- 同一个 `AbortSignal` 贯穿模型请求、脚本、API 和异步发布事务。

## 6. 发布与事务不变量

- Mutation 返回成功前，AuthoringState 和可查询运行时状态必须已经发布到同一 Revision。
- 地貌、水系、植被和对象 tombstone 使用局部 Runtime Delta，不调用全量 `generateWorld()`。
- 池塘/湖泊事务同时处理盆地和水面。溪流/河流始终保留真实语义资产、稳定 Ref 和领域参数；在原生流动水表现恢复前，Runtime 表现边界临时把它们发布为等面积湖泊代理。该代理只影响地形与水面的运行时表现，不得把公共 `kind`、属性或查询结果改写成 lake。
- 玩家创建水体在水面发布成功后登记到 `SeedWorldAuthoredWaterQueryRegistryV1`；删除成功后再移除。`spatial.search`、贴水约束和水草生成查询同一份已发布水面几何，禁止只读取初始世界的静态 `waterMask`。
- 局部地景修改保持玩家 X/Z 和朝向；地形高度变化后只允许角色随地面更新 Y。
- 资源 `contentHash` 只存在于 Application 与 EnginePort 之间，不暴露给 LLM。

## 7. 验收门禁

完成变更前必须同时满足：

1. 生成契约检查通过，生成文件与运行时契约一致；
2. 每个 Tool 和具体资产都存在唯一生成模块；Tool 私有 DTO 不得生成 common 模块，全部生成 `.d.ts` 可由 TypeScript 正常解析；
3. APISearch 模块解析测试证明：搜索任意 Tool 都会自动带齐真实传递依赖，搜索多个入口会合并闭包且每个模块只返回一次；
4. `world.query` 和 `world.inspect` 声明都不得隐式注入具体资产；搜索 `world.inspect` 加一个具体 Asset 符号时能形成按 `ref.kind` 收窄的返回类型；
5. Terrain TypeScript 类型检查通过；
6. Agent 协议、运行时、资产管理器和 21 API 的回归测试通过；
7. 真实 Wrapper + ASAP + LLM 浏览器链路逐项验证资产 CRUD、时间、空间、天象和撤销；
8. Agent Trace 证明每个任务始终使用同一组 `api_search / execute` 原生 Tool，按需加载声明、执行脚本并基于真实 Tool Result 收敛，没有重复成功操作或 Workflow 协议调用。

真实浏览器中的历史验收记录见 [AGENT_CRUD_SMOKE_REPORT.md](./AGENT_CRUD_SMOKE_REPORT.md)。
验收报告必须同时区分 Agent Loop 的 `completed` 状态与用户意图是否真实完成，不能只用任务状态计算功能通过率。

## 8. 根因记录

### 玩家创建水体无法承载后续空间任务

旧链路中渲染器已经发布池塘或河流，但空间查询只读取初始 `SeedWorldFields.waterMask`。因此“先创建池塘，再在池塘里种水草”会出现视觉上有水、语义查询却认为无水的分裂状态。最终方案不是补写一个水草特判，而是由水体投影产出与渲染一致的查询几何，并由 Runtime EnginePort 合并自然水体与玩家创建水体的实时查询结果。

### 多阶段脚本引用未加载 API 时发生部分执行

旧链路只在实际调用 Tool 时才发现 API 未加载。若脚本先修改世界、后调用未加载查询 API，就会留下已生效的半次脚本，并迫使 LLM 猜测是否重放。最终方案在 `main()` 执行前完成静态 API 引用预检；任何缺失声明都先返回规划期错误，整段脚本零执行。

### 资产实现与 `world.inspect` 精确输出契约漂移

玩家创建池塘真实返回 `seed`，但 `PondAssetProperties` 曾遗漏该字段，导致创建成功后 `world.inspect` 被输出 Schema 拒绝。修复原则是把 `seed` 纳入水体公共语义属性并重新生成 `.d.ts` / APISearch 声明，而不是放宽为任意属性或在输出端删除真实字段。

### 真实浏览器证据

- 通过真实 Wrapper + ASAP + LLM 完成：在玩家面前创建池塘 → 以池塘 Ref 创建水草区 → 扩大水草区范围 → inspect 验证 → 删除两项 → `world.query` 确认删除。
- Agent Trace 最终状态为 `completed`，调用了 `water.create`、`vegetation.create`、`vegetation.update`、`world.inspect`、`world.query`，没有 `task_failed`。
- 21 个公开 API 已逐项经真实 Wrapper + ASAP + LLM 覆盖：资产查询/检查/标签/选择/删除/撤销，位置搜索/解析/传送，时间与天象读写，地形 Patch 与地貌、水系、植被 create/update。
- 自然资产索引实测穷尽分页 4,681 项，覆盖 object、vegetation、water、terrain、poi、infrastructure；自然树 tombstone 的删除、按 ID 查询归零和撤销恢复均完成。
- `spatial.search` 的 `surface.elevationMetres` 表示当前可见表面：水域是水面，陆地是地形。验证地形高度变化必须设置 `constraints.water=false`，不能用不变的水面高度误判水底地形编辑失败。
