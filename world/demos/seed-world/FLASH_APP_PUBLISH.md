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

闪应用构建直接使用仓库默认的 `pnpm` 工作树（Node.js ≥ 20.19），无需额外创建 npm worktree 或转换 `package-lock.json`。干净工作树先执行 `pnpm install --frozen-lockfile`。随后构建引擎模块和地形着色器，再生成公共运行基座与全部 6 份模板运行目录：

```bash
# 在仓库根目录构建原生引擎和地形着色器
pnpm b:module
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
- **静态产物备份机制（跳过云端构建红线）**：发布时每个应用的 OSS 备份（`--source-dir`）直接指向该模板的静态构建目录 `world/dist/seed-world-flash-apps/<templateId>`（不含 `package.json`）。云端克隆（`copy`）沙箱通过检查备份根目录是否存在 `package.json` 来决定是否运行 `npm run build`——沙箱不跑 `npm ci` 且有 60s `build_timeout`，因此**严禁把仓库根目录或任何含 `package.json` 的目录作为 `--source-dir`**；保持备份内无 `package.json` 才能让灵光平台识别为静态项目、跳过构建，直接重签新实例的 `window.artifactId` / `window.artifactVersion` 并秒级完成部署。

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

## 3. 编排发布 6 个灵光闪应用

使用 `world/scripts/publish-seed-world-flash-apps.mjs` 编排发布 6 个应用：
- **默认 `--registry-mode http`**：可在任意开发机直接执行（无需直连 OceanBase/Layotto），通过 `GET /api/trace/versions_by_artifact` 校验基线版本、按逐应用独立 `app_key`（`<appKey>-<timestamp>-<hex>`，避免多应用覆盖同一雨燕 Entry URL）部署，并通过 `POST /api/flash-app/register` 登记版本（502–504/网络超时重试前自动按 `entryUrl` 查重防止双增版本号）。
- **`--registry-mode direct-db`**：仅在能访问目标 OceanBase/Layotto 登记库的发布机执行；先用 `--verify-registry` 只读核对登记库与 PUGC HTTP 服务环境，先预留版本再核对存档表、打包、上传和部署，最后提交登记（预留或登记重试沿用同一个发布 ID）。

`PUBLISHER_ROOT` 下的 `scripts` 目录须提供 `asap-publish.cjs`、`asap-service-url.cjs` 和 `asap-remote-skill.cjs`。存档接口和版本查询须指向同一 ASAP 环境。

```bash
ENGINE_WORKTREE_ROOT=/absolute/path/to/engine
PUBLISHER_ROOT=/absolute/path/to/compatible-pugc-publisher
ASAP_SERVICE_DIR=/absolute/path/to/asap-service

# 0. （仅 direct-db 模式）只读核对发布机的登记库
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --verify-registry --publisher-root "$PUBLISHER_ROOT" --asap-service-dir "$ASAP_SERVICE_DIR"

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
- **逐应用类型与版本**。应用类型由清单声明，服务端在预留版本时核对类型。只有发布单个模板时才能使用与清单不同的 `--type`。
- **防重复申请 ID**：新申请的 5 个 `artifactId` 在调用远端接口前即落盘到本地状态（传 `--sync-catalog` 时同步回写 `flash-apps.json`），失败重试时严格复用同一个 ID。
- **上传前核对共享存档**。每个应用（包括复用的原版）均使用对应的 Artifact ID、预留版本和作者的 `2099...` `alipayUid` 核对目标环境。确认无 `world_save` 时执行 `world_save.sql`。脚本读回符合预期的 Share 表结构后才上传。使用 `--skip-db-init` 时要求表已存在且结构匹配。

## 4. 发布后验收与正式上架

每个应用只有在 **OSS 上传、数据库注册、Artifact 版本更新、Entry URL** 四部分全部成功后才算完成：

1. **6 个 Entry URL 核验**：逐一打开汇总表中的 6 个 Entry URL，确认页面已注入本次 `window.artifactId` / `window.artifactVersion`，免弹窗直接进入对应模板 3D 世界，局内无跨模板切换入口，AI Chat 可用。
2. **新申请 5 个 ID 的线上能力与 ASAP 专用流式 Action 核验**：
   - 编排器自动登记新 `artifactId` 并创建 `world_save` 表；
   - 确认线上壳提供 `window.lingguang.ai.seedWorldStream` 和 `seedWorldStop`；
   - 目标 ASAP 通过专用 action 选模，接收顶层工具声明、多轮消息和图片；
   - 核对实际 Agent Trace 的 `debug.modelRoute=seed_world_action` 和 `debug.modelName=aisearch_dsv41flash`。
3. **共享存档与权限策略核验**：对 5 个新应用验证克隆新实例获得 `MANAGER` 且表为空、原实例访客（`USER`）允许读存档并拒绝写入。
4. **灵光侧正式上架**：PUGC 更新后，在灵光侧为需要更新分享链接的应用重新执行正式发布 / 上架，并确认分享页内层 `meta[name="flash-app-html-url"]` 与主 JS hash 已切到本次 Entry。

## 5. 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Publisher app-context.local.json artifactId ... does not match catalog "original"` | `--publisher-root` 指向了非 `flashapp-a3c0e021cb8cadb0` 的 PUGC checkout | 切回 `pugc-flash-app-2-seed-world`，或在明确知道原因时传 `--allow-context-mismatch` |
| `Template "<id>" has no artifactId yet` | 尚未为其余 5 个模板首次申请 ID | 确认新建意图后加 `--init-missing --sync-catalog` 执行一次，之后提交更新后的 `flash-apps.json` |
| `requires a 2099... alipayUid to verify world_save` | 本地状态或 PUGC 上下文未填写 `2099...` UID（或误填了 `2088...`） | 在 PUGC `app-context.local.json` 或对应 Artifact 的状态文件补全 `alipayUid` 后重试 |
| 构建警告 `Local CDN-eligible asset(s) not yet in flash-app-cdn-manifest.json` | 新增或变更的资产（如 `oil-paint` SWB1 分包）尚未同步至 MDN CDN | 执行 `sync-flash-app-cdn-assets.py --apply` 并重编 `pnpm --dir world build:seed-world-flash-app`（收敛至 `pending upload: 0`） |
| 完成登记失败，输出 `--resume-release <id>` | 产物已部署，登记结果待确认 | 用输出的命令重放本机发布回执。该命令只完成原预留版本的登记 |
| `Artifact type differs from the ASAP registry` | 发布类型与线上记录不一致 | 核对该应用的登记类型和 `flash-apps.json` 后重试 |
| `ASAP registry does not match` 或 `check ASAP registry access` | 发布机无法访问目标登记库，或 PUGC HTTP 服务与登记库指向不同环境 | 在发布机运行 `--verify-registry`，核对连接和服务环境后再发布 |
| Trace 路由异常或无工具调用 | 目标环境的专用 action 或 SDK 尚未就绪 | 核对壳方法、请求工具声明与 ASAP Trace 的 `modelRoute`、`modelName` |
