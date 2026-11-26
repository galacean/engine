---
name: seed-world-flash-publish
description: 将 Seed World 构建为共享公共层、共享 MDN CDN 与共享源码快照的 6 个独立模板灵光闪应用产物（original 复用旧 Artifact，其余 5 模板各自独立 Artifact），校验根入口、classic Worker 与 PUGC 扩展名兼容，并复用 PUGC 的建表和部署接口，由 ASAP 分配发布版本。触发词：发布这个闪应用、发布闪应用、发布成灵光闪应用、更新闪应用、灵光闪应用上架、发布六个模板闪应用。不用于本地 ASAP/Wrapper 联调（见 seed-world-local-debug）。
---

# Seed World 灵光闪应用发布（6 模板独立应用版）

仅要求创建、修改或解释本 Skill 时，不执行构建或线上发布。
完整原理、参数说明与故障排查见 [FLASH_APP_PUBLISH.md](../../../world/demos/seed-world/FLASH_APP_PUBLISH.md)。

## 架构概览：1 次公共构建 + 6 份轻量应用派生

Seed World 对外发布为 **6 个独立灵光闪应用**，但完全复用同一套公共运行时、MDN CDN 资产与源码快照：

| 模板 ID | 默认标题 | Artifact 策略 |
| --- | --- | --- |
| `original` | `Seed World AIChat` | **复用已有** `flashapp-a3c0e021cb8cadb0` 与现有版本线 |
| `sakura-pearl` | `Seed World · 樱雪仙境` | 独立 Artifact ID（首次发布时建表） |
| `emerald-forest` | `Seed World · 萤光巨木森林` | 独立 Artifact ID（首次发布时建表） |
| `low-poly` | `Seed World · Low Poly` | 独立 Artifact ID（首次发布时建表） |
| `titan-wasteland` | `Seed World · 幻兽荒原` | 独立 Artifact ID（首次发布时建表） |
| `oil-paint` | `Seed World · 秋林油画` | 独立 Artifact ID（首次发布时建表） |

- **共享公共构建**：`build-seed-world-flash-app.mjs` 只执行 1 次 Vite 生产构建产出 `world/dist/seed-world-flash-app`，再按 `world/demos/seed-world/flash-apps.json` 自动派生 6 份运行目录 `world/dist/seed-world-flash-apps/<templateId>`。
- **6 个独立 Demo / 严格单模板入口**：仓库提供 6 个独立 Demo HTML（`world/demos/seed-world/{index,sakura-pearl,emerald-forest,low-poly,titan-wasteland,oil-paint}.html`），每个 Demo 与对应派生闪应用均通过 `<meta name="seed-world-default-template" content="<templateId>" />` 与独立 `<title>` 绑定唯一模板。应用内已彻底移除 6 选 1 启动弹窗、规划器风格切换、`?template=` 参数与跨模板恢复逻辑。
- **共享 CDN 与共享源码快照**：6 个模板（含 `oil-paint`）均走 SWB1 分包 + `mdn.alipayobjects.com` 不可变直链；6 个应用的 `--source-dir` 共用 1 份通用源码快照 `world/dist/seed-world-flash-source`（`< 100 MiB`，1 次未压缩构建逐文件 SHA-256 校验）。
- **配置与状态分离**：
  - 仓库静态目录：`world/demos/seed-world/flash-apps.json`（记录 6 模板 ID、默认标题、线上 `artifactId` 与逐应用 `type`：`original` 为 `game`，其余 5 应用为 `miniapp`，**绝不存放 `alipayUid` 或凭据**）。
  - 发布结果按 Artifact 分文件保存在 `~/.config/galacean-flash-app/apps/<artifactId>.local.json`，权限为 `0600`。建表请求显式携带对应应用的 Artifact ID 和 ASAP 分配的版本。

## 1. 发布前核对

1. 选定 Engine 提交，记录路径、分支和 HEAD。用独立 Git 工作树做 npm 发布构建。若要纳入当前未提交的应用源码，明确范围并应用到发布工作树。影响源码快照重建的原生引擎改动须纳入所选提交。
2. 仅打包时执行第 2 节。发布时还需定位含 `scripts/asap-publish.cjs` 与 `scripts/asap-remote-skill.cjs` 的 PUGC checkout（`PUBLISHER_ROOT`，建议指向绑定 `flashapp-a3c0e021cb8cadb0` 的 `pugc-flash-app-2-seed-world`），以及具备 `.venv/bin/python` 和目标环境 Artifact 注册库读写权限的 ASAP checkout（`ASAP_SERVICE_DIR`）。
3. 核对 `world/demos/seed-world/flash-apps.json` 与对应 Artifact 的本机状态文件。
   - `original` 必须继续绑定 `flashapp-a3c0e021cb8cadb0`（`type: "game"`），其余 5 应用使用清单中各自登记的 `artifactId` 与 `type: "miniapp"`；干跑通过 `GET /api/trace/versions_by_artifact` 查看已发布版本。执行时由 ASAP 分配正式版本。批量发布使用清单中的逐应用类型。
   - **首次创建其余 5 个新模板应用前**，必须先经用户明确确认新申请 5 个 ID 与标题，并确保 PUGC `app-context.local.json` 或对应 Artifact 状态文件已填好 `2099...` 开头的 `alipayUid`，以便为 5 个新应用自动执行首次 `world_save.sql` 建表。

## 2. 使用 npm 打包（1 次公共构建 + 6 份模板派生）

在 Node.js ≥ 20.19、npm 10.9.3 环境执行以下命令。示例从当前 HEAD 创建发布工作树：

```bash
git worktree add --detach ../seed-world-npm-release HEAD
cd ../seed-world-npm-release
node world/scripts/build-seed-world-npm.mjs
```

脚本在该工作树生成 npm workspace 配置和 `package-lock.json`，执行 `npm ci`，重新编译引擎与地形着色器，然后产出：

- `world/dist/seed-world-flash-app`：共享公共运行基座（根部含 `index.html`，校验相对路径、classic Worker（含 `OilPaintBrush`）、资源清单与 PUGC 扩展名）。
- `world/dist/seed-world-flash-apps/<templateId>`：6 个独立模板运行目录（`original`、`sakura-pearl`、`emerald-forest`、`low-poly`、`titan-wasteland`、`oil-paint`），逐一校验默认模板 `<meta>`、`<title>` 与文件集一致性。
- `world/dist/seed-world-flash-source`：6 应用共用的自包含可重建源码快照（含全部 World + 原生 Engine workspace、`packages/modify/.cache`、最小构建期编译件、裁剪后的 npm 锁文件、`REBUILD.md` 与 `SOURCE_SNAPSHOT.json`，解压后可直接 `npm ci && npm run build` 产出根 `dist/`，校验双次未压缩构建逐文件 SHA-256 一致且归档 ≤ 100 MiB）。

若需增量同步 CDN（含新增的 `oil-paint` SWB1 分包或变更资源），在发布工作树内执行：

```bash
"$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py
# pending upload > 0 时使用已配置的 AFTS 凭据执行 --apply 并重编（合并文本包哈希变化时再收敛一轮至 0）
"$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py --apply
npm run build:seed-world-flash-app --workspace world
# CDN 清单收敛后重跑源码快照，保证源码快照与 6 份运行产物字节级一致
npm run build:seed-world-flash-source --workspace world
```

## 3. 本地静态冒烟（可选）

按需对任意派生目录启动临时静态服务（例如验证 `oil-paint` 或 `sakura-pearl` 是否无弹窗直达对应模板）：

```bash
python3 -m http.server 4180 --bind 127.0.0.1 --directory world/dist/seed-world-flash-apps/oil-paint
```

访问 `http://127.0.0.1:4180/?aiChat=1&bootTrace=1`（无需传 `?template=`）核对自动进入目标模板、不弹启动 6 选 1、无 404 / Worker 报错、SWB1 与 text bundle 命中，完成后立即关闭临时服务。

## 4. 执行 6 应用 PUGC 编排发布

统一使用 `world/scripts/publish-seed-world-flash-apps.mjs`。默认干跑。执行时让 ASAP 的 `SERVER_ENV`、Artifact 注册库连接和 `ASAP_SERVICE_BASE_URL` 指向同一环境。编排器会用该环境的一条已发布记录核对注册库，然后依次预留版本、按该版本建表和打包、上传部署、提交预留版本。每个 Artifact 的归档放入独立临时目录。

**PUGC 兼容性。** PUGC 默认分支的独立 CLI 读取共享的 `app-context.local.json`，且可能为不同应用生成同名的临时备份。Seed World 编排器只读取该配置并复用 PUGC 的底层助手，独立准备上下文和归档。
```bash
# 1. 先干跑核对 6 应用计划表（Artifact ID、版本估计、逐应用 type、是否需要首次建表）
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR"

# 2A. 首次为其余 5 个模板申请新 ID、自动执行 world_save.sql 建表并发布全部 6 个应用：
#     （--init-missing 生成 5 个新 ID 并立即持久化防重；--sync-catalog 回写至 flash-apps.json）
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --execute --init-missing --sync-catalog \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR" \
  --timeout 300

# 2B. 后续常规同步发布全部 6 个应用（不再传 --init-missing）：
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --execute \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR" \
  --timeout 300

# 2C. 若中途部分模板失败，仅针对失败模板重试（已成功的版本与新 ID 已落盘）：
node "$ENGINE_WORKTREE_ROOT/world/scripts/publish-seed-world-flash-apps.mjs" \
  --execute --templates sakura-pearl,oil-paint \
  --engine-root "$ENGINE_WORKTREE_ROOT" \
  --publisher-root "$PUBLISHER_ROOT" \
  --asap-service-dir "$ASAP_SERVICE_DIR" \
  --timeout 300
```

远端部署失败时，预留的版本仍处于未发布状态。只重试失败的模板，ASAP 会分配新版本。

## 5. 交付与发布后验收清单

交付时报告：
- Engine 路径、分支、commit、是否存在未提交改动（若更新了 `world/demos/seed-world/flash-app-cdn-manifest.json` 或首次回写了 `world/demos/seed-world/flash-apps.json` 中的 5 个新 `artifactId`，明确提醒提交这两个文件）；
- 产物统计（公共基座与 6 份派生目录文件数/体积、共享源码快照体积与压缩包体积）；
- **6 应用发布汇总表**：每个模板的 `templateId`、`title`、`artifactId`、`artifactVersion`、`type`、建表状态与 `Entry URL`（不输出任何凭据、私钥或 `alipayUid`）。

并明确提醒用户完成线上侧验收：
1. **6 个 Entry URL 逐一核验**：确认注入本次 `window.artifactId` / `window.artifactVersion`，免弹窗直达各自模板 3D 世界，局内无跨模板切换按钮，AI Chat 正常。
2. **新申请 5 个 ID 的白名单与能力声明**：新 `artifactId` 与 `world_save` 表均由脚本自动生成/登记，无需人工去平台申请 ID；但 `asap-service` 的 `dsv41flash -> aisearch_dsv41flash` 路由目前受 `common_config.mini_app_ai_chat_model_mapping_enabled_artifact_ids` 白名单门控（当前仅包含 `original` 的 `flashapp-a3c0e021cb8cadb0`），因此**必须将新生成的 5 个 `artifactId` 补进该白名单配置**并确认已开放 `AI_STREAM_CHAT` 能力声明（核对 Agent Trace `debug.modelName` 及服务端 digest）。
3. **共享世界存档策略验收**：对 5 个新应用核对 `world_save` 表已就绪、克隆实例获得新 `MANAGER` 且表为空、原实例访客（`USER`）允许读存档并拒绝写入。
4. **灵光侧正式上架 / 分享链接更新**：为需要更新对外分享链接的应用重新执行正式发布 / 上架，确认分享页内层 `meta[name="flash-app-html-url"]` 与主 JS hash 已切到本次 Entry。
