# Harness 实战经验、避坑清单与 RSI 待办 Backlog

本文件沉淀自首轮完整无头压测与 P0 改造（commit `cf2dad337`，5 组同口径高摩擦用例轮次 `-73.7%`、耗时 `-83.8%`、Token `-79.4%`、步数膨胀比 `8.25x → 2.17x`）的工程教训，避免后续高频迭代重复踩坑。

---

## 一、通道与环境避坑

1. **先探活再开跑**：
   - 本地 `127.0.0.1:8082` 返回 HTTP 200 **不代表**上游模型网关可达。内网 VPN 断开时 `antchat.alipay.com` 会 DNS 解析超时，导致整套评测空等超时。务必先跑 `scripts/preflight.py`。
2. **ASAP 8082 心跳帧与真实错误区分**：
   - `asap-8082-transport.ts` 已处理 `lingguang_ai_chat_recovery` 保活心跳与 `lingguang_ai_chat_stream_result_bridge` 结构化校验；修改 transport 时切勿用粗暴正则（如裸匹配 `429`/`500` 数字子串）误杀正常文本流或心跳。
3. **强制校验模型路由**：
   - 永远保持 `BENCH_EXPECTED_MODEL`（默认 `DeepSeek-V4.1-Flash`）严格断言，防止 ASAP 配置变更导致静默切到其他模型，污染 A/B 对比口径。
4. **串行 + 冷却 + 断点续跑**：
   - 本地 8082 上游并发低，严禁改成 Vitest 并发跑多题；保持串行、`BENCH_COOLDOWN_MS=1500` 与 `BENCH_SKIP_EXISTING=1`，中途断网恢复后可无缝续跑。

---

## 二、夹具漂移（Fixture Drift）检查

无头压测依赖 `resources/llm-benchmark/seed-world-headless-fixture.ts` 组装真实 `HeadlessEngine + RuntimeProjectSession + RuntimeNativeEditor + SeedWorldAgentApplication + AgentLoop + asap-chat.ts`。
当仓库更新后出现大面积或离奇报错时，优先检查 4 处同步点：
1. **宿主组装对齐**：`static-audit.spec.ts` 和 `seed-world-headless-fixture.ts` 中对 `createSeedWorldChatAgentConfiguration`、`createSeedWorldWaterAgentKnowledge`、`createFarmingComponentExtension`、`createRetrievalAgentExtension` 的拼装是否落后于最新 `SeedWorldDemo.ts` / `SeedWorldChatPanel.ts`。
2. **Node 侧资源与 Worker Shim**：历史上 Case 15 曾因测试资产 GLB 与 Node `blob:` 加载兼容问题造成假失败；新增资产或修改 loader 时需同步验证 `installLocalFetchShim` / `installLocalWorkerShim` / `KTX2Loader` mock。
3. **无头 Null RHI 边界**：`Shader.create` 与渲染相关 mock 仅用于无头环境不崩溃，不代表 WebGL 实渲染视觉验收（材质色板、光影仍需在真实浏览器预览目视核对）。
4. **不要把临时评测目录带入正式 Commit**：`world/tests/seed-world/llm-benchmark/` 仅作为运行载体；如未来决定将其正式纳入 CI，应先把 `static-audit.spec.ts` 独立成无网络依赖的 CI 门禁测试，在线 `run-benchmark.spec.ts` 保持手动/定时触发。

---

## 三、首轮 CR + `diagnose-issue` 暴露出的 4 类高发工程隐患

后续改 `packages/ai-chat` 或领域文档时，主动自查这 4 类问题：
1. **并行 `read` 预去重与分页截断冲突**：同批并行读同一路径或传递依赖时，必须按**单页实际行数与字节预算**判断是否预声明去重，不能对被截断的读请求提前登记为“已完整读完”，否则后续页会丢失尾部声明。
2. **循环收敛护栏的状态重置**：`postCommitReadOnlyRounds` 等防过度排查计数，在**新用户输入进入**或**能力刷新**时必须清零，防止多轮对话里用户追问查看细节时误触发停机提示。
3. **文档与结构化回执一致性**：凡是注入给模型的辅助提示（如 `<omitted_dependencies>`），其文本内容与工具结构化回执字段必须保持同源一致，并配单元测试锁死。
4. **空间/色板等隐性语义文档必须逐项核对源码**：例如圆形墙面 `u` 参数手性、砖瓦色号映射，严禁凭直觉手写文档，必须核对实际生成/预览源码并在有条件时做 WebGL 目视验色。

---

## 四、已知高价值 RSI Backlog（按 ROI 排序）

首轮已完成 P0（commit `cf2dad337`），后续 RSI 迭代可直接从以下已证实的候选项切入：

### P1（中期降本减噪与防退化）
1. **`pick` 工具定义瘦身 / 按需暴露**：`pick` 单体约 3.5 KB（占 12 个工具定义总字节 21.5%），纯文本任务使用率为 0；可精简 schema 或仅在存在图片附件 / 执行过 `snapshot` 后注入。
2. **Compaction 工作记忆锚点保活**：长会话触发 compaction 后，目前会把已读 `.d.ts` 与关键实体/资产 ID 映射洗掉导致重读；可在 compaction 摘要模板中强制保留“已确认 ID 映射 + 关键 API 签名 + 已提交状态”。
3. **`declare/editor/` 自动内联加缓存 + `declare/engine/` 按需直读**：`declare/engine/` 不自动内联，避免重型 barrel（`Entity.d.ts`、`Script.d.ts`）提前触发 transcript compaction。
4. **把 `static-audit.spec.ts` 固化为离线 CI 门禁**，并清理残留术语（`AssetCatalog`、`/assets`、`agent-knowledge-paths.ts` 旧路径注释）。
5. **补齐 `createSeedWorldWaterAgentKnowledge` 独立单测**，解耦 `{ includeDigRiver: true }` 对基础 catalog 的隐式假设。

### P2（架构契约收敛）
1. **统一三层命名空间（`tools.<system>.*` / `editor.*` / `tools.runtime.*`）的新增 API 约定**：过滤参数统一 `filters`、关键词统一 `search`、集合返回统一 `{ items }`，持续压缩 `TS2339`/`TS2353` 摩擦。
2. **超大 `.d.ts`（如 57 KB `FarmingSystem.d.ts`）拆分子声明或支持 Symbol Outline 读取**，避免分页截断。
3. **跨系统配置能力路由优化**：确保各系统 `*.config.{get,update,reset}` 在对应一级 Skill 中清晰披露，避免跨系统配置误路由。
