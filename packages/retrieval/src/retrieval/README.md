# Retrieval

当前项目的独立资产库模块。浏览器 Worker 查询预建索引，候选摘要分块读取，完整描述和物料按 URL 加载。
不依赖 Engine、Editor、Seed World 或 LLM。没有常驻 Node 服务；Node 只运行示例生成／离线索引构建。
OSS 下载、定期同步、鉴权和部署由外部 skill 负责。本模块不安装系统包，也不向 project.json 登记资产。

## 入口与职责

- `index.ts`：浏览器调用入口 `RetrievalClient`，拥有一个可终止的 Worker。
- `src/library.ts`：单版本查询、摘要缓存、描述读取、来源路径到 URL 的解析。
- `src/storage.ts`：有字节上限的 HTTP 读取；不缓存物料，不管理项目。
- `src/contracts.ts`：输入输出和存储格式；搜索／描述查询沿用 OasisBE Agent 的字段。
- `src/build.ts`：离线 `buildRetrievalCatalog(sources)`，返回 manifest 和需要保存的 artifacts，不访问网络、不写磁盘。
- `src/keyword-index.ts`：名称、标签、简短描述的关键词包含匹配，没有词典或 WASM。
- `examples/`：三个 PrimitiveMesh 小型示例及可直接操作的查询页面。

`../retrieval-agent/` 注册只读 `search_assets`、`read_asset_descriptions` 和 `source_text`（当前仅 action=read，支持行分页），不打开编辑事务。大结果复用 Agent 的输出文件与 read 分页读取。
Seed World 默认消费 `catalog.json` 的 manifestUrl；未发布 catalog 时为 null，不启用召回。`tests/llm/seed-world-retrieval.html?catalog=<URL>` 可指定独立验收库，不修改正式配置。

`createRetrievalAssetSource` 将来源解析接到 Editor 的 `asset.import`：只在导入时解析一个选中资产的文件清单，按需下载；导入范围内的临时文件视图随操作释放。整个外部库不挂进项目 VFS，只有成功导入后才写入 project.json、内容和 .meta。单文件读取上限 64 MiB，一次导入 256 MiB。当前支持宿主已有资产格式，不实现 GRP 包安装或新的音频导入格式。

Agent 对话携带 `assets` 的 Skill 摘要，检索流程位于子 Skill `skills/assets/search-cloud/SKILL.md`。Skill 按需读取，API 声明由 `declare/editor/` 提供。

## search_assets 的调用约定

`query` 使用简短资产关键词，多个关键词用空格分隔，不传玩家整句话。例如玩家说“在我面前放一张木头桌子”，查询可使用 `木 桌`；“给树林加点鸟叫声”使用 `鸟叫` 并设置音频类型。位置、数量和操作由调用方处理。没有结果时减少限定词或更换常见说法。

匹配名称、标签和简短描述中的字面子串。匹配关键词数量优先，其次完整名称相等、名称命中、标签命中、描述命中；每个词只计最优字段，不以重复出现刷分。同分按来源 key 排序，保证稳定翻页。多个关键词允许部分匹配，模型需检查候选是否符合需求。没有中文分词、同义词扩展、正则或自然语言理解；这些规则属于 Tool 契约，不放入 System Prompt。

## 给同步 skill 的数据合同

每个源资产提供一个 `SourceAsset`：

```ts
{
  key: "assets/model/birch/describe.json",
  metadata: {
    assetType: "model",
    assetPaths: ["assets/model/birch/Birch.glb"],
    overview: { name: "白桦树", description: "白色树皮、绿色树冠", tags: ["树木"] }
  },
  descriptionUrl: "https://example.com/assets/model/birch/describe.json",
  resources: [
    { path: "assets/model/birch/Birch.glb", url: "https://example.com/assets/model/birch/Birch.glb" },
    { path: "assets/model/birch/README.md", url: "https://example.com/assets/model/birch/README.md" }
  ]
}
```

`metadata` 使用完整 describe.json 内容。运行时索引只保留 key、assetType、overview.name、overview.description，以及 overview、visualProfile、usage、technical 和顶层 tags 中的字符串。名称、描述和标签进行 NFKC、大小写和空白归一化；不索引技术参数、usage 的说明文本、README 或其他完整元数据。
`assetPaths` 和可选 `manifestPath` 指向的每个文件必须提供 URL。额外 README 等也需要显式列入 resources。
路径保持 `assets/...`，文件必须属于本资产目录；模型看到的路径加 `/oss/`。物料只提供 URL，不嵌入内容。
候选的 `assetPaths` 只列物料，README 等额外资源不会变成独立候选。

`buildRetrievalCatalog` 产出：

```text
manifest.json                 # 小型入口，版本、索引和摘要块位置／SHA-256
index/<hash>.bin               # key/type、名称、标签和简短描述；没有物料
summaries/<hash>.json          # 每块至多 128 条／默认 256 KiB；摘要、详情 URL、物料 URL
```

`.bin` 内容为 gzip 压缩的索引，按 `application/octet-stream` 提供，保持文件字节不变；不要将这层压缩标记为 HTTP `Content-Encoding: gzip`，否则 fetch 会提前解压，导致哈希不一致。

skill 保存所有 artifacts 后，最后替换 manifest.json。以内容 hash 命名的文件不可原地修改。
这是拆分存储格式 v2，searchStrategy 为 keyword-substring-v1。旧分词索引直接拒绝，需要用当前构建器重新生成；没有旧算法兼容路径。Agent 查询和返回字段继续沿用 OasisBE，但检索算法已变更，见 [UPSTREAM.md](UPSTREAM.md)。
完整描述通过规范化 JSON 哈希与发布版本绑定；URL 内容变化会明确失败，需重新生成目录，不拼接新旧版本。
物料 URL 应稳定或由宿主提供 URL 解析策略；当前静态 resources 不刷新过期签名，也不承诺物料内容不可变。
浏览器跨域读取要求目标允许 CORS，普通 Node 读取成功不能证明浏览器可用。

## 使用

```ts
import { RetrievalClient } from "@galacean/engine-retrieval/retrieval";
const library = new RetrievalClient("https://example.com/catalog/manifest.json");
const page = await library.searchAssets({ query: "白桦树", maxResults: 10 });
const details = await library.readAssetDescriptions({ descriptionPaths: [page.matches[0].descriptionPath] });
const source = await library.resolveResource(`/oss/${page.matches[0].assetPaths[0]}`);
// source.url 留给 Editor 导入。检索不下载 GLB。
library.dispose();
```

第一次查询才创建 Worker 并加载 manifest/index；搜索只加载结果页所需的摘要块。没有分词库、词典或 WASM 下载。
每个库实例绑定一个版本，翻页必须携带 corpusHash。要看到更新，dispose 旧实例并创建新实例。
默认缓存最多 8 个摘要块（每块上限 1 MiB），不缓存完整描述或物料。
超时（默认 30 秒）、取消和 dispose 会终止 Worker 并拒绝其全部未完成调用，随后可重新查询；dispose 后不可再用。
索引恢复与排序在 Worker 内同步运行，因此取消通过终止 Worker 生效，不靠主线程上的协作让步。

## 示例与验证

安装 Gallery 依赖后，从物化 Gallery 执行：

```sh
pnpm retrieval:examples    # 默认示例 URL 为 http://127.0.0.1:4176/library/
pnpm test:retrieval
pnpm typecheck:retrieval
pnpm exec vite --config packages/retrieval/src/retrieval/examples/vite.config.mjs
```

打开 `http://127.0.0.1:4176/`。搜索“平台／方盒／立柱”，再点完整描述、使用说明或物料地址。
示例生成脚本可传入另一 base URL；它只生成三份测试数据，没有同步远端的逻辑。
依赖/锁文件由 Gallery 统一持有，模块不作为独立 npm 包发布。

正式默认 catalog 已发布 13,778 个非蓝图资产；关键词索引 gzip 后 506,778 字节，解压后 4,299,451 字节。108 个摘要块合计 18,383,502 字节，按候选所在块读取，不随首次搜索全量加载。真实浏览器使用正式配置搜索消防车、树、按钮和鸟，并读取完整描述、解析物料 URL 均通过；首次搜索约 388 ms，仅为本次桌面环境观测，不代表移动端性能或全库召回质量验收。示例页仍保留三份独立测试资产。

### 真实 LLM 冒烟入口

1. 提供上述三个示例的静态文件于 `http://127.0.0.1:4176/library/`，允许前端源跨域读取。
2. 按 `seed-world-local-debug` skill 启动当前工作树与 ASAP；Wrapper 的 `mini_app_url`、`app_shell_url` 都指向前端 `/tests/llm/seed-world-retrieval.html?aiChat=1&agentTrace=1`。
3. 主要验收使用没有工具提示的玩家目标，如“我要一个直升机。”。在新会话中发送原话，不提示素材库、关键词、搜索、导入或 API；观察模型是否自主判断资源需求并召回。没有候选时应如实说明，不能把未找到说成已创建。搜索命中不等于已经导入或满足玩家目标，分别记录。
   - “现在世界里是几点？”作为不应触发召回的对照。
   - “有没有适合当台阶的平台素材？想知道它有多大。”、“有没有细长的柱子素材？想知道它有多高。”仅保留为明确检索意图的底层回归，分别核对宽平台 6×1×6 米、细立柱高 5 米；不能用这两条代替普通玩家目标的触发验收。
4. 保存 Agent Trace，核对实际模型、关键词、候选、详情与最终回复；另外记录重复查询和没有数据依据的额外描述，不以任务 completed 直接代替质量验收。

`tests/llm/retrieval-acceptance.ts` 提供导入验收和只读运行状态检查。以真实 CDN 消防车小型 catalog 完成了两种独立验证：确定性导入验收，以及真实 LLM 自主执行“在我面前放一辆消防车。”。后者自行读取 Skill、搜索、读取描述、导入 GLB、创建 Script 与场景实例；真实画面可见，刷新后保留相同实例及资源引用。证据见 Seed World 的 V2_IMPLEMENTATION.md。这证明模型外观放置链路，不代表驾驶玩法、所有资源格式或全库召回质量已经通过验收。
