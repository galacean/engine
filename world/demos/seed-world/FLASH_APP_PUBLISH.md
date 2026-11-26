# Seed World 灵光闪应用构建与发布指南（6 模板独立应用版）

本文说明如何在当前 monorepo 结构下，通过 **1 次 pnpm 公共构建 + 6 份轻量模板派生**，将 Seed World 发布为 6 个独立的灵光闪应用（共享公共运行时与 MDN CDN 资产，各应用以自身已构建静态目录作为 OSS 备份），并通过内部 PUGC 发布工具编排完成建表、上传、注册与线上验收。

若希望由 Agent 直接执行发布流程，可直接对 Agent 说“**发布闪应用**”（对应 Skill：[`.agents/skills/seed-world-flash-publish/SKILL.md`](../../../.agents/skills/seed-world-flash-publish/SKILL.md)）。本地 AI Chat / ASAP Wrapper 联调不属于线上发布流程，见 [`.agents/skills/seed-world-local-debug/SKILL.md`](../../../.agents/skills/seed-world-local-debug/SKILL.md)。

## 0. 六应用映射与配置分层

Seed World 6 个模板分别对应 6 个独立闪应用，元信息与本机状态严格分离：

- **仓库静态清单**（[`world/demos/seed-world/flash-apps.json`](./flash-apps.json)，入库，供多人协作共享正式 `artifactId` 防止误建重复应用）：
  - `original`：标题 `Seed World AIChat`，**复用已有** `flashapp-a3c0e021cb8cadb0` 与现有版本线；
  - `sakura-pearl`：标题 `Seed World · 樱雪仙境`，首次发布新申请 `artifactId`；
  - `emerald-forest`：标题 `Seed World · 萤光巨木森林`，首次发布新申请 `artifactId`；
  - `low-poly`：标题 `Seed World · Low Poly`，首次发布新申请 `artifactId`；
  - `titan-wasteland`：标题 `Seed World · 幻兽荒原`，首次发布新申请 `artifactId`；
  - `oil-paint`：标题 `Seed World · 秋林油画`，首次发布新申请 `artifactId`。
- **本机可变状态**按 Artifact 保存在 `~/.config/galacean-flash-app/apps/<artifactId>.local.json`，记录版本号、建表状态与发布结果。这些文件均不入库。

每个独立 Demo（`world/demos/seed-world/{index,sakura-pearl,emerald-forest,low-poly,titan-wasteland,oil-paint}.html`）及对应派生闪应用均在 HTML 中声明 `<meta name="seed-world-default-template" content="<templateId>" />` 与应用 `<title>`：
- 6 个应用与本地 Demo 均**严格单模板**，应用内已彻底移除启动 6 选 1 弹窗、规划器风格切换入口、`?template=` URL 参数与跨模板历史存档恢复分支。

## 1. 前置环境与构建产物（1 公共基座 + 6 模板运行目录）

闪应用构建直接使用仓库默认的 `pnpm` 工作树（Node.js ≥ 20.19），无需额外创建 npm worktree 或转换 `package-lock.json`。若当前分支拉入了引擎/着色器改动，先刷新预编译件，再一次生成公共运行基座与全部 6 份模板运行目录：

```bash
# 如刚 rebase/修改引擎或地形着色器，先执行：
pnpm --dir world prepare:engine
node world/scripts/prepare-terrain-shaders.mjs Grass Surface Terrain Vegetation

# 构建公共运行基座 + 自动派生 6 份单模板运行目录
pnpm --dir world build:seed-world-flash-app
```

产出目录结构如下：

```text
world/dist/seed-world-flash-app                  # 共享公共运行基座（供 CDN 扫描与派生）
world/dist/seed-world-flash-apps/original        # 实际发布目录：原始 Seed World
world/dist/seed-world-flash-apps/sakura-pearl    # 实际发布目录：樱雪仙境
world/dist/seed-world-flash-apps/emerald-forest  # 实际发布目录：萤光巨木森林
world/dist/seed-world-flash-apps/low-poly        # 实际发布目录：Low Poly
world/dist/seed-world-flash-apps/titan-wasteland # 实际发布目录：幻兽荒原
world/dist/seed-world-flash-apps/oil-paint       # 实际发布目录：秋林油画
```

构建脚本（`world/scripts/build-seed-world-flash-app.mjs` + `world/scripts/flash-app-variants.mjs`）会自动校验：

- **根入口与相对路径**：目录根部直接包含 `index.html`，Vite `base` 为 `./`，所有资源均以相对路径引用（不出现 `/assets/` 或 `../`），兼容主页面与静态资源分属 `lingguangcontent.com` / `lingguangobjects.com` 的场景。
- **Worker 跨源与移动 WebView 兼容**：`worker.format` 为 classic IIFE，所有 emitted Worker（含 `OilPaintBrush.worker`）统一改写为同源 classic Blob `importScripts(...)` 引导，并通过 `vm.Script` 逐个核验。
- **PUGC 物理扩展名兼容**：为 `.asset`、`.br`、`.f32le`、`.r8`、`.r16`、`.rgb8`、`.treewind` 等追加 `.wasm` 物理后缀并同步重写清单 `path`，保留原始 `virtualPath`。
- **独立运行时闭包与 6 模板 SWB1 + MDN CDN 分流**：全部 6 个模板（含 `oil-paint` 的 `oil-paint-water-swirl-*.ktx2` 与白桦结构 JSON）均按模板打入 SWB1 分包，并按 `world/demos/seed-world/flash-app-cdn-manifest.json` 改写为 `mdn.alipayobjects.com` 不可变直链。6 个应用完全共享同一批 CDN 资产，增量同步只需在公共基座上执行一次：
  ```bash
  # 干跑检查待上传资产数量；非 0 时改用 --apply 上传并重编（自动刷新全部 6 份派生目录）
  "$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py
  "$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py --apply
  pnpm --dir world build:seed-world-flash-app
  ```
  > 若 `project.json` 的 CDN URL 发生变化，合并文本包 `seed-world-project-text-bundle-*.json` 的哈希会更新，再执行一次 `--apply` 与 `build:seed-world-flash-app` 即可收敛至 `pending upload: 0`。
- **6 份派生目录一致性门禁**：校验每个 `world/dist/seed-world-flash-apps/<templateId>` 均包含精准的 `<meta name="seed-world-default-template" content="<templateId>" />`、独立 `<title>`、相对入口脚本，且除 `index.html` 外与公共基座文件集合完全一致。
- **静态产物备份机制**：发布时每个应用的 OSS 备份（`--source-dir`）直接指向该模板的静态构建目录 `world/dist/seed-world-flash-apps/<templateId>`（不含 `package.json`）。云端克隆（`copy`）恢复到工作区后，灵光平台会识别为静态项目、跳过 React 沙箱内的 `npm run build`，直接重新注入新实例的 `window.artifactId` / `window.artifactVersion` 并完成部署，保证 6 个模板克隆各自保真且数秒内完成。

> 不要把仓库根目录、`world/dist/seed-world`（普通多 Demo 目录结构）或 `node_modules` 当作闪应用产物目录发布。

## 2. 本地静态冒烟验证（可选）

启动原版派生目录的静态服务。此目录同时用于下面的共享存档验收。

```bash
python3 -m http.server 4180 \
  --bind 127.0.0.1 \
  --directory world/dist/seed-world-flash-apps/original
```

浏览器打开 `http://127.0.0.1:4180/?aiChat=1&bootTrace=1`，核对是否直接进入原版世界、控制台是否有 404 或 Worker 报错，以及 SWB1 和合并文本包是否命中。

在另一个终端对上述原版服务执行 SQLite 共享存档验收。

```bash
node world/scripts/acceptance/shared-world-storage.mjs http://127.0.0.1:4180
```

## 5. 编排发布 6 个灵光闪应用

使用 `world/scripts/publish-seed-world-flash-apps.mjs` 编排 6 个应用的建表与发布。执行环境需要访问目标 ASAP Artifact 注册库。脚本先通过 ASAP 原子预留版本，再用该版本建表、打包、部署并提交发布记录。可用 `--state-dir` 指定按 Artifact 隔离的本机状态目录。

```bash
ENGINE_WORKTREE_ROOT=/absolute/path/to/engine
PUBLISHER_ROOT=/absolute/path/to/pugc-flash-app-2-seed-world
ASAP_SERVICE_DIR=/absolute/path/to/asap-service

# 1. 干跑预览 6 应用发布计划（默认 --dry-run，不会触发任何远端写操作）
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR"

# 2A. 首次为其余 5 个模板申请新 ID、自动执行 world_save.sql 首次建表并发布全部 6 个应用
#     确保 PUGC app-context.local.json 已填写 2099... alipayUid
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --execute --init-missing --sync-catalog \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR" \
  --timeout 300

# 2B. 后续常规发布全部 6 个应用
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --execute \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR" \
  --timeout 300

# 2C. 局部重试（仅发布指定子集，例如某两个模板网络波动失败）
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --execute --templates low-poly,oil-paint \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR" \
  --timeout 300
```

关键保护机制：
- **防误切 checkout**：发布 `original` 时若 `$PUBLISHER_ROOT/scripts/app-context.local.json` 中的 `artifactId` 与 `flash-apps.json` 的 `flashapp-a3c0e021cb8cadb0` 不一致，默认直接拒绝执行。
- **逐应用 `--type` 与版本对齐**：各应用登记类型由 `world/demos/seed-world/flash-apps.json` 分别声明（`original` 为 `game`，其余 5 个新应用为 `miniapp`）；干跑用已发布记录估计版本，执行以注册库分配的版本为准。只在发布单个模板时才使用与清单不同的 `--type`。
- **防重复申请 ID**：新申请的 5 个 `artifactId` 在调用远端接口前即落盘到本地状态（传 `--sync-catalog` 时同步回写 `flash-apps.json`），失败重试时严格复用同一个 ID。
- **首次自动建表**：对每个未建表的新应用，使用该应用的 `artifactId`、预留版本和作者的 `2099...` `alipayUid` 应用 `world_save.sql`。建表结果未确认时读取服务端表结构，只有确认 `world_save` 为符合预期的 Share 表才继续发布并标记 `dbInitialized: true`。

## 6. 发布后验收与正式上架

每个应用只有在 **OSS 上传、数据库注册、Artifact 版本更新、Entry URL** 四部分全部成功后才算完成：

1. **6 个 Entry URL 核验**：逐一打开汇总表中的 6 个 Entry URL，确认页面已注入本次 `window.artifactId` / `window.artifactVersion`，免弹窗直接进入对应模板 3D 世界，局内无跨模板切换入口，AI Chat 可用。
2. **新申请 5 个 ID 的线上能力与 ASAP 路由放行**：
   - 编排器自动登记新 `artifactId` 并创建 `world_save` 表；
   - 5 个新 `artifactId` 需开放 `AI_STREAM_CHAT` 能力声明，且必须加入 `asap-service` 配置 `common_config.mini_app_ai_chat_model_mapping_enabled_artifact_ids`（目前该白名单只含 `original` 的 `flashapp-a3c0e021cb8cadb0`），否则 `model: "dsv41flash"` 不会路由到 `aisearch_dsv41flash`（核对 Agent Trace `debug.modelName` 与服务端 digest）。
3. **共享存档与权限策略核验**：对 5 个新应用验证克隆新实例获得 `MANAGER` 且表为空、原实例访客（`USER`）允许读存档并拒绝写入。
4. **灵光侧正式上架**：PUGC 更新后，在灵光侧为需要更新分享链接的应用重新执行正式发布 / 上架，并确认分享页内层 `meta[name="flash-app-html-url"]` 与主 JS hash 已切到本次 Entry。

## 7. 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Publisher app-context.local.json artifactId ... does not match catalog "original"` | `--publisher-root` 指向了非 `flashapp-a3c0e021cb8cadb0` 的 PUGC checkout | 切回 `pugc-flash-app-2-seed-world`，或在明确知道原因时传 `--allow-context-mismatch` |
| `Template "<id>" has no artifactId yet` | 尚未为其余 5 个模板首次申请 ID | 确认新建意图后加 `--init-missing --sync-catalog` 执行一次，之后提交更新后的 `flash-apps.json` |
| `requires first-time world_save.sql DB table creation, which needs a 2099... alipayUid` | 本地状态或 PUGC 上下文未填写 `2099...` UID（或误填了 `2088...`） | 在 PUGC `app-context.local.json` 或对应 Artifact 的状态文件补全 `alipayUid` 后重试 |
| 构建警告 `Local CDN-eligible asset(s) not yet in flash-app-cdn-manifest.json` | 新增或变更的资产（如 `oil-paint` SWB1 分包）尚未同步至 MDN CDN | 执行 `sync-flash-app-cdn-assets.py --apply` 并重编 `pnpm --dir world build:seed-world-flash-app`（收敛至 `pending upload: 0`） |
| `Artifact type differs from the ASAP registry` | 发布类型与注册库记录不一致 | 核对该应用的登记类型和清单后重试 |
| `ASAP registry does not match` | ASAP Python 环境无法核对 HTTP 服务返回的已发布版本 | 检查注册库访问权限以及对应的 `ASAP_SERVICE_BASE_URL` |
