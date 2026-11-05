# OasisBE 契约来源与当前差异

参考来源：`OasisHub/oasisbe` 的 `sprint_oasisbe_S090011919497_20260920` 分支，提交 `5f08208b18776dd783934c6c1fa792a30101e048`，目录 `app/editor-agentic/src/agent/tools/sandbox/`。

保留搜索和完整描述查询的参数/结果字段、`/oss/assets/` 来源路径以及 describe.json 的物料声明规则。存储使用本模块独立的索引、摘要块和详情 URL 合同，并非上游单文件 catalog v5。

2026-11-03 用户决定：LLM 在 search_assets 调用时提供关键词，移除中文分词 WASM 以降低包体和下载成本。本模块已删除此前复制的 ICU/Jieba、BM25/BM25F、短语融合及 MiniSearch 构建实现。

当前仅按空格拆分调用方提供的关键词，在归一化的名称、标签、简短描述中做包含匹配。索引格式与原排序不兼容，必须重新构建；不宣称与 OasisBE 排名或召回质量相同。完整规则和调用方式见 README 与 searchAssetsToolContract。

没有引入 OSS 同步、服务端、认证或 LLM 编排。后续切换远端服务时复用 Tool 参数/结果合同，接入方需要核对服务的搜索语义。
