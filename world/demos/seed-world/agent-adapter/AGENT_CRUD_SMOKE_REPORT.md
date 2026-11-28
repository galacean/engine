# Agent CRUD 与公共 API 真实链路冒烟报告

## 1. 验收范围

- 运行分支：`dev/demo`，基于远端 `dev/2.0`。
- 运行入口：Seed World Planner 的 `aiChat=1&agentTrace=1` 本地真实浏览器环境。
- Runtime 标识：`dts-module-graph-v1`。
- 模型链路：真实 AgentScriptCalling Loop；不是直接调用 Runtime，也不是单测桩。
- 覆盖范围：25 种持久资产的创建、读取、更新、删除共 100 条指令，以及 14 条公共 API 指令，共 114 条。
- 判定口径：`completed` 只表示 Agent Loop 正常收敛；是否满足用户意图必须同时检查 Trace 中的脚本、Tool 结果、稳定 Ref、实际修改结果和最终文案。

任务状态统计：111 条 `completed`，3 条 `failed`。按指令遵循与能力兑现综合判断，仍存在查询目标漂移、能力缺失、确定性空间候选不足和模型输出格式错误，不能把 111/114 当作功能通过率。

## 2. 资产 CRUD 结果

表中 `C/R/U/D` 分别表示创建、读取、更新和删除。每个 UUID 都是可在 Agent Trace 中定位的 `interactionId`。

| ID | 资产 | 指令与 Trace | 结论 | 指令遵循 |
| --- | --- | --- | --- | --- |
| A01 | mountain | C「在我面前100米处生成一个山峰」`c5a8d8cd-8481-4557-9e99-f4a0a0364a2e`；R「查询离我最近的山峰…」`25f21ed8-f6d7-44cb-99be-b841b15314bc`；U「高度增加10米」`a823606d-0b8e-402d-bd70-95c5ce697a04`；D「删除刚才查询到的山峰」`e841d09c-9e2f-4587-ae6a-30e0d9931ff2` | 创建成功；随后“查询离我最近的山峰”按指令选中距离更近的自然山峰。自然山峰更新失败，删除被 `NOT_EDITABLE` 拒绝。 | 高：查询目标符合“最近”语义；更新和删除准确反馈自然资产的能力边界。 |
| A02 | hill | C `95849c98-1727-4362-aa13-d6f35e01a552`；R「查询刚刚创建的玩家山丘…」`fe06f1d4-f472-45e5-8ad3-a81144320275`；U `2baf1832-6b4e-4efe-8844-289ccc7fcdc7`；D `7532f6d3-33d8-46e6-841b-008199e9f1ed` | 创建、检查、基座抬升 40→45m、删除全部成功。 | 高 |
| A03 | ridge | C `21861135-1283-4f7d-adfd-0fa6c7b78f16`；R `8b978deb-7210-4ba7-b056-82b39c352f4c`；U `0d54ce11-891c-4a6c-9ceb-05caed406a8e`；D `597c900a-d52f-4168-842d-fc92f0fdabe4` | 创建、检查、高度 55→63m、删除成功；删除前出现一次声明缺失并由 Loop 修复。 | 高，存在一次无害修复重试。 |
| A04 | canyon | C `f33a86b8-77fb-44c9-9d87-40629ed75dad`；R `40f7faa9-ffb2-4430-98a1-893863af65c1`；U `8aefd9a8-56b3-42a2-b35b-59c579488b15`；D `422ecd7b-1de7-40af-b7e1-5e37e7f8b3cc` | 创建、检查、深度 -42→-47m、删除全部成功。 | 高 |
| A05 | valley | C `b93bf49c-c8e6-468a-af2b-22125ae50792`；R `1530337b-e1fb-429c-933f-aa0987327627`；U `116872f1-d6be-4e31-bc13-976788d542ed`；D `c13b40ec-4c0a-4a77-9f24-fe2ee2a4a634` | 创建、检查、深度 -30→-35m、删除全部成功。 | 高 |
| A06 | slope | C `9957daaf-6bce-47a6-999c-4286e2ab34c9`；R `ee86edb5-c408-4812-b568-2921ff093438`；U `ac81158f-cc2e-4900-b520-f6f10c25bae1`；D `7a43260f-2b66-4b1b-b825-d7d76aec3c01` | 创建、检查、高度 38→43m、删除全部成功。 | 高 |
| A07 | plateau | C `5fd9b093-1a0a-431f-b13c-65ecacee0ef3`；R `14fa0760-1a19-48e1-953c-a3a85113ee8a`；U `82ca8d53-f347-4e1a-b45c-01d1c1d98a32`；D `e12c907f-580f-4cba-9cd0-b33557906586` | 创建、检查、高度 45→50m、删除全部成功。 | 高 |
| A08 | basin | C `7bb9444b-77af-4d20-a1c0-6b83b85d20c0`；R `3659ce61-7af5-4b48-9113-7663d43a750c`；U `eaed3242-10e1-41e5-9d9c-00979255af7a`；D `26f4274b-5e0d-4908-b504-fd8c0aa4dd32` | 创建、检查、深度 -32→-37m、删除全部成功。 | 高 |
| A09 | ocean | C `8e075556-e95f-44dd-8879-e8783076950d`；R `6d0c8e82-2edc-4c89-962c-7f5a5b795522`；U `d0d580aa-c553-4385-910f-8a6edf590eb7`；D `3a1844ef-a650-4ab0-9dce-af5cf8a64570` | 创建轮最终文案声称生成 authored ocean 并返回 `agent-water-body-68`，但公开 `water.create` 不支持 ocean，后续 Trace 又将该 ID 识别为 lake，因此创建结果与文案不一致。“最近海洋”查询正确选中 natural ocean；更新明确不支持，删除返回 `NOT_EDITABLE`。 | 低：创建没有兑现海洋语义；后续查询和能力拒绝本身符合指令与契约。 |
| A10 | lake | C `1c1ddbb7-3d00-4313-9392-de1884fa49b5`；R `3f175ec6-4e6e-4397-a92c-f170fcf04117`；U `6933db2f-ddfd-457f-8f7b-379cae301143`；D `f247dd4f-30a9-42c9-b5ba-ad52f10c8ee1` | 创建、检查、水位降低 1m、删除全部成功。 | 高 |
| A11 | pond | C `b699a063-a07b-4834-9dd8-beb00dbff0b1`；R `11186988-6d26-46fd-8d88-e4a82369b5d0`；U `725e81d8-6fdd-43dd-bba5-e0a5cbb9b7de`；D `1aef9961-a38f-4650-9462-6a533834aad4` | 创建、检查、水位降低 1m、删除全部成功。 | 高 |
| A12 | river | C `692ff7dc-26bb-41a2-ae75-dd1295e07ee9`；R `066f8d37-5860-4a58-9883-3f4234461586`；U `43790ede-1652-4a7f-9163-6bcb88c0e2cb`；D `78d7c9bb-00ce-428e-bc77-fb34c0b8a93e` | 公开 river 语义下创建、检查、水深 3.5→2.5m、删除成功。 | 高；底层降级实现需单独由 Runtime 测试保证。 |
| A13 | stream | C `724f552a-d38f-42ff-85fc-bc90db98cfcd`；R `3542894d-7f66-41e9-a4b6-87e386bf69d9`；U `112091e3-f5d2-4a32-b2c1-6c1d0e88e61b`；D `5fad1503-bb79-4ce4-8d35-be3d60036b02` | 公开 stream 语义下创建、检查、水深 0.8→0.3m、删除成功。 | 高 |
| A14 | tree | C `9e2381c7-93f2-48ad-a369-7b841a08578d`；R `07d86ea8-f1ce-4dd7-be5e-a797358e1c1d`；U `b734e2d7-6c01-4d36-83e3-a55d15db7328`；D `58852365-885a-476f-8568-ee84264ec12d` | 创建因 `VEGETATION_CAPACITY_EXCEEDED` 失败：半径 3m 只有 1 个确定性 slot，碰撞后没有局部重采样；后续无目标可读改删。 | 低：Runtime 原子能力未兑现常见指令。 |
| A15 | forest | C `0836d718-cdf8-440c-8ce0-346f0b1c50b5`；R `ec28ab74-cb20-42e8-b25c-dc4694fe2f72`；U `b1fcde48-f891-4bd0-9fe0-3a7d04cfa8be`；D `006ba629-6ade-4c03-8cea-d0a5606f67dc` | authored forest 创建 20 棵成功；读取却选中 13m 外的 natural forest（2 棵），随后更新/删除又作用到 authored Ref。 | 低：链路中的语义目标前后不一致。 |
| A16 | shrub | C `aa923e46-ff3a-4407-8aed-a2e8f7a4f2cd`；R `aa9a7109-38e2-4eab-88e8-e362adcf040b`；U `05b6d042-5deb-4a5f-ac4d-831251f56a5e`；D `eb5ad654-0a82-44f8-abaf-573375835bee` | 创建、检查、删除成功；领域更新契约不支持缩放，模型给出明确拒绝。 | 中：行为清晰，但公开能力无法满足更新指令。 |
| A17 | shrubland | C `da643667-4f5d-4ea6-ae22-b4d97187a903`；R `b273471c-3fd0-4461-88b2-960fbfdb690e`；U `e9206549-c032-413f-9e55-39fb73d1d08f`；D `8125fd93-784d-4783-9038-f33245bdfdd0` | 18 株创建与实际数量一致，更新为 12 株并删除成功。 | 高 |
| A18 | grassland | C `21a75d50-3fbf-4daf-bcf0-949f61b11f6a`；R `d5678c9d-0eea-4cfd-a923-88e6c5dc12bc`；U `334b0a03-f9cf-46ea-ac6a-ff7c1dcbfc4a`；D `70f55985-5d1c-4b8c-9895-10b1872f94a2` | 半径 10m 创建、检查、扩大到 15m、删除成功。 | 高 |
| A19 | flower-field | C `53d449f5-8dcf-40d0-aafc-79ce46eaf755`；R `778c722d-3c97-442f-89a2-d292ce150df4`；U `e4011b14-b5a9-4ca5-9b95-05deb1928e29`；D `433aa570-9e56-4310-8f01-532b8949c093` | 半径 10m 创建、检查、扩大到 15m、删除成功。 | 高 |
| A20 | aquatic-grass-bed | C `4600bd45-7c97-4fad-ac73-7b9b5d01b45f`；R `fe572325-8462-4234-bde6-0f4ffe9a1a47`；U `e2f1662b-787d-40e2-963f-97592e98926c`；D `b0418797-9988-4a4f-ab3d-379b21dc21fc` | 在真实水域中创建、检查、半径 8→12m、删除成功。Trace 将 `agent-water-body-68` 识别为湖泊，印证 A09 创建轮的“海洋”最终文案不可信。 | 高 |
| A21 | rock | C `b1feee17-177d-4946-8132-85ccbfc4dac9`；R `b4351e63-e14b-4eb7-9167-8bfcab3ed40a`；U `49f599da-8151-4d41-b1ba-caa2aca54a8c`；D `bc2daa08-be6b-436f-84b5-3ac935829720` | 没有 object.create；模型误试 terrain.create 后明确拒绝。自然岩石可查询、打标签并删除。 | 中：能力边界最终正确，但发生无效领域调用。 |
| A22 | mushroom | C `af9d8277-10d2-49b9-b596-620affc04744`；R `17188239-f440-4755-8d1a-d1169f9b4604`；U `938494e6-6f6b-400b-92af-7b1587c6fdf4`；D `5cf37a11-bd95-4786-8dd3-1607c07083e1` | 没有 object.create；模型误试 vegetation.create 后明确拒绝。自然蘑菇可查询、打标签并删除。 | 中：能力边界最终正确，但发生无效领域调用。 |
| A23 | road | C `5809d8ec-9ff2-4c18-bb98-d320bb87276a`；R `35a54bdf-84af-45c1-8d0c-eaf801e888be`；U `86d896e5-47db-4738-8592-2e8b9e95558d`；D `bd540d0f-d5b1-451c-8bb6-ebf21d9f9f81` | 没有 road.create；自然道路可查询和打标签，删除明确返回 `NOT_EDITABLE`。 | 中：边界清楚，但 CRUD 不完整。 |
| A24 | bridge | C `c1bf8040-87bc-4e92-b8f4-299cca006f67`；R `301008e7-1a2d-42a9-9d6f-634670d2b6e2`；U `047d9822-8875-45be-a5b2-540d06469fe8`；D `51e540aa-2375-4148-a4f9-90f4c56e55f6` | 没有 bridge.create，当前世界也没有桥梁资产，因此其余操作无目标。 | 低：无法验证资产 CRUD。 |
| A25 | poi | C `aa5a57fa-898f-4afa-88e8-ca7eb5ffe001`；R `8c53ab82-e1d1-4f08-87e3-b41bea1d78ad`；U `41ad9fe5-b1aa-48aa-98da-85ca3633af4e`；D `b598e923-97e7-4bf2-a34e-c20745ebc70b` | 没有 poi.create；自然 POI 可查询和打标签，删除明确返回 `NOT_EDITABLE`。 | 中：边界清楚，但 CRUD 不完整。 |

## 3. 公共 API 结果

| ID | API / 指令 | Trace | 结论 | 指令遵循 |
| --- | --- | --- | --- | --- |
| C01 | `world.query`：查询离我最近的一棵树 | `e51eb2f6-b8eb-4e3f-a737-684a68cc9940` | 返回稳定 Ref 与约 5m 距离。 | 高 |
| C02 | `world.inspect`：检查刚才查询到的树 | `eb0e044f-39cd-4171-8196-c2d9297cd29c` | 一次加载并检查具体 TreeAsset；本次未再出现“公共声明与领域声明割裂”。 | 高 |
| C03 | `world.tag.update`：添加 `common-smoke` | `77b700c6-aea0-4a23-828a-5d38c28f40a3` | 标签添加成功。 | 高 |
| C04 | `world.selection.save`：保存为“冒烟树” | `e5960317-4d49-4350-afb4-d786d51f0ecf` | 最终保存成功，但先触发一次 `MISSING_API_DECLARATION` 后修复。 | 中：能力检索晚一拍。 |
| C05 | `world.selection.get`：读取“冒烟树” | `511262d0-f81b-4cae-84e5-9ad83e05ed39` | `AgentDecisionError`，模型最终决策未形成合法协议输出。 | 低 |
| C06 | `world.undo`：撤销标签事务 | `6f8ccb02-be12-4032-a13a-4e9ddfabeaec` | 标签事务撤销成功。 | 高 |
| C07 | `spatial.search`：实时搜索最高地表位置 | `b312e061-ef44-4e2f-a268-be936479b6aa` | 返回坐标与 325.49m 海拔。 | 高 |
| C08 | `spatial.resolve`：解析面前 30m 且贴地 | `f51d99c1-b4c3-4dde-953e-7b88f6117947` | 返回确定坐标。 | 高 |
| C09 | `spatial.teleport`：传送到世界最高点 | `210f18ab-5b3e-4657-bf48-4ceb241030bc` | 最终传送成功，但先触发一次 `MISSING_API_DECLARATION` 后修复。 | 中：能力检索晚一拍。 |
| C10 | `time.get`：读取时间和季节 | `74aaa352-bd23-4053-b2c5-e1ccbfc1dfb5` | 返回 12:00、夏季。 | 高 |
| C11 | `time.update`：20:00、秋季 | `674aa157-2afb-45b1-a065-d91ae194e9c3` | 修改成功。 | 高 |
| C12 | `atmosphere.get`：读取风雨雪雷云雾 | `2b4e6160-fc85-42b0-8f1b-8acbb967180b` | 返回完整连续状态摘要。 | 高 |
| C13 | `atmosphere.update`：小雨、风速 8m/s | `f96e0a6b-2ceb-47d4-a3d7-c36ba836e8b1` | 修改成功。 | 高 |
| C14 | `terrain.patch`：面前 50m 抬高 2m | `3165b23a-2164-4171-bac4-55261a691e4f` | 空间解析与局部地形修改成功。 | 高 |

## 4. 对独立 `.d.ts` 与依赖闭包方案的验证

1. 本轮记录发生时，`world.inspect` 的返回声明会直接导入全部 25 个具体 Asset 模块，因此 C02 以及多个资产读取任务能在一次旧 APISearch 闭包中获得具体属性。后续当前架构已改为 `query item.type → /assets 精确详情声明 → inspect(item.ref)`，按需读取一个详情文件；本条只保留为当次验收的历史证据。
2. 同一任务搜索多个入口时，两个依赖闭包按规范化模块 ID 合并去重，每个共享类型和具体 Asset 模块最多返回一次；生成声明已通过真实 `tsc --noEmit`。
3. `world.selection.save` 与 `spatial.teleport` 的一次 `MISSING_API_DECLARATION` 不属于 import 闭包丢失：两者是独立 Tool 入口，模型没有在写脚本前搜索对应 Tool。Loop 能 fail-closed 并修复，但仍增加一次模型往返。
4. `world.selection.get` 的失败是模型决策协议错误，不是 Runtime 或 `.d.ts` 类型错误。

## 5. 根因优先级

### P1：树林链路的目标身份不一致

树林链路中，创建返回 authored forest，读取“刚刚创建的树林”却选择了 natural forest，后续更新和删除又作用到 authored Ref，前后目标身份不一致。山峰和海洋的读取指令明确要求“最近”，选中更近的 natural 资产符合指令，不能归入历史 Ref 漂移。对于“刚刚创建的”这类明确指代，应优先复用历史结果中的稳定 Ref；用户明确要求重新查找或比较距离时，则必须按本轮查询语义执行。

### P1：单株植被只有一个确定性候选点

单树创建把“面前 20m”解析成一个中心点，Runtime 只尝试该点；该点与已有植被碰撞后，即使旁边存在大量空地也会直接报容量不足。原子能力应在允许半径内生成多个确定性候选并逐个验证，直到成功或穷尽空间。

### P1：公开资产目录与可变能力不对称

Rock、Mushroom、Road、Bridge、POI 是可查询资产，但没有对应创建能力；自然 Road/POI 又不可删除。固定 APISearch Catalog 必须直接声明每类资产支持的操作集合，让模型在检索声明和编写 Agent Script 前知道能力边界，避免误试 `terrain.create` / `vegetation.create` 或输出模糊 Schema 错误。

### P2：能力检索仍可能晚一拍

独立 `.d.ts` import graph 已解决“一个 Tool 自身的传递类型依赖”，但不能替模型猜出另一个 Tool。`selection.save` 和 `spatial.teleport` 仍曾先写未加载声明的 API，再由 `MISSING_API_DECLARATION` 修复。System Prompt 明确要求 Agent Script 引用的所有 Tool 都必须先由 APISearch 加载；Runtime 继续保持 fail-closed 预检。

### P2：Trace 面板预览不是可机器解析的完整 JSON

大 Trace 达到 120000 字符时，面板会在 JSON 字符串中间插入“预览已截断”文本，因此 `<pre>` 展示内容本身无法再被 `JSON.parse`。完整下载 JSON 仍应作为权威记录；面板可另外提供不截断的结构化摘要或在字符串边界外表达截断信息。

## 6. 最终结论

独立 Tool/Asset `.d.ts`、真实 TypeScript import 闭包解析和模块去重方案符合直觉，并且已经消除了本轮重点验证的 `world.inspect` 领域声明割裂。当前主要失败已经从“LLM 不知道 API 类型”转移到三类更具体的问题：树林链路的目标身份不一致、Runtime 原子空间求解不足、资产目录与可变能力不对称。后续优化应优先处理这三项，而不是继续向 System Prompt 堆叠领域特例。
