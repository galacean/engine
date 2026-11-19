---
name: seed-world-flash-publish
description: 将 Seed World 构建为灵光闪应用产物与可重建源码快照，校验根入口、classic Worker 与 PUGC 扩展名兼容，并通过 pugc-flash-app-2 完成上传、注册与线上验收指导。触发词：发布这个闪应用、发布闪应用、发布成灵光闪应用、更新闪应用、灵光闪应用上架。不用于本地 ASAP/Wrapper 联调（见 seed-world-local-debug）。
---

# Seed World 灵光闪应用发布

仅要求创建、修改或解释本 Skill 时，不执行构建或发布。
完整原理、参数说明与故障排查见 [FLASH_APP_PUBLISH.md](../../../world/demos/seed-world/FLASH_APP_PUBLISH.md)。

## 1. 发布前核对

1. **确认当前 Engine 工作树**：记录仓库根路径、当前分支、HEAD commit 以及 `git status -s`；存在未提交改动时明确告知用户将基于当前工作树打包，不自动提交或清理用户改动。
2. **定位发布工具目录（`PUBLISHER_ROOT`）**：
   - 优先使用用户指定的 `pugc-flash-app-2` 路径。
   - 若用户未指定，先在本机常见相邻目录查找含 `scripts/deploy.cjs` 与 `scripts/init-app-context.cjs` 的目录；找到多个或找不到时直接请用户确认路径，不硬编码个人目录。
3. **确认 Artifact 归属（发布前必查）**：
   - 检查 `$PUBLISHER_ROOT/scripts/app-context.local.json` 是否存在。
   - 一个发布工具 checkout 只能绑定一个 Artifact；禁止借用其他应用的 `app-context.local.json`。
   - 若文件已存在，告知用户将复用该 checkout 绑定的已有 Artifact 更新版本；若不存在，确认是否要初始化为全新 Artifact（执行 `init-app-context.cjs`），并确认应用标题（默认 `Seed World AIChat`）。

## 2. 环境与构建

在所选 Engine 仓库根目录执行（Node.js ≥ 20.19，pnpm 9.3.0）：

1. 若缺少 `packages/modify/.cache/shaders.ts`，或本次改动涉及 `packages/modify` / shader 源码，先准备引擎产物：
   ```bash
   pnpm b:module
   pnpm --dir world prepare:engine
   ```
2. 构建并校验闪应用产物与可重建源码快照：
   ```bash
   pnpm --dir world build:seed-world-flash-app
   pnpm --dir world build:seed-world-flash-source
   ```
   - 唯一允许作为 `--project-dir` 的目录是 `world/dist/seed-world-flash-app`（根目录直接含 `index.html`、`base: "./"`、所有 Worker 经 classic Blob `importScripts(...)` 引导、PUGC 不支持扩展名已转为 `.wasm` 物理后缀）。
   - 唯一允许作为 `--source-dir` 的目录是 `world/dist/seed-world-flash-source`（已通过未压缩构建逐文件 SHA-256 一致性校验与 `< 100 MiB` 压缩体积门禁；旁边的 `.tar.gz` 仅作体积证据，不传给发布器）。
   - 若两份产物刚刚基于当前完全一致的工作树构建完成且用户确认复用，可跳过重复构建，但须核对产物存在且无新源码改动。

## 3. 本地静态冒烟（可选）

若用户要求发布前先验证画面，用临时静态服务起在 `world/dist/seed-world-flash-app`：

```bash
python3 -m http.server 4180 --bind 127.0.0.1 --directory world/dist/seed-world-flash-app
```

访问 `http://127.0.0.1:4180/?aiChat=1` 核对 3D 加载、无 404 与无 Worker 报错，完成后立即关闭该临时 HTTP 服务。普通静态页无 ASAP 通道，不代表线上 AI Chat 已验收。

## 4. 执行 PUGC 发布

发布依赖 `asap-service` 的 Python 3.10+ 环境（如 `$ASAP_SERVICE_DIR/.venv/bin/python`）；若默认 `python3` 不是该环境，显式传入 `ASAP_SERVICE_DIR` 和 `ASAP_PYTHON`。`--type` 须与已有 Artifact 在数据库中的记录一致（`miniapp` 或 `game`，默认先核对或按 Step 5 返回的已有类型保持一致）。

```bash
# 仅首次创建该 Artifact 且经用户确认时执行；后续版本直接复用同一个发布工具 checkout。
test -f "$PUBLISHER_ROOT/scripts/app-context.local.json" || \
  node "$PUBLISHER_ROOT/scripts/init-app-context.cjs"

env -u OSS_ACCESS_KEY_ID -u OSS_SECRET_ACCESS_KEY \
  ASAP_SERVICE_DIR="$ASAP_SERVICE_DIR" \
  ASAP_PYTHON="$ASAP_SERVICE_DIR/.venv/bin/python" \
  node "$PUBLISHER_ROOT/scripts/deploy.cjs" \
    --project-dir "$ENGINE_WORKTREE_ROOT/world/dist/seed-world-flash-app" \
    --source-dir "$ENGINE_WORKTREE_ROOT/world/dist/seed-world-flash-source" \
    --title "${TITLE:-Seed World AIChat}" \
    --type "${APP_TYPE:-miniapp}" \
    --app-key flash-app \
    --timeout 300
```

只有在 **OSS 上传、数据库注册、Artifact 版本更新、Entry URL** 四部分全部成功后才算发布完成；任一阶段报错立即停止并报告原始错误，不跳过门禁或伪造成功。

## 5. 交付与发布后验收清单

交付时报告：
- Engine 路径、分支、commit、是否存在未提交改动；
- 产物统计（`world/dist/seed-world-flash-app` 文件数与体积、`world/dist/seed-world-flash-source` 源码体积与压缩包体积）；
- 发布结果：`artifactId`、`artifactVersion`、Entry URL（不输出任何凭据或私钥）。

并明确提醒用户完成线上侧验收：
1. 打开 Entry URL，确认已注入本次 `window.artifactId` / `window.artifactVersion`，进入 3D 验证 AI Chat。
2. 如需更新已有正式分享链接，必须在灵光侧重新执行正式发布 / 上架，并确认分享页内层 `meta[name="flash-app-html-url"]` 与主 JS hash 已切到本次 Entry。
3. 核对线上能力声明允许 `AI_STREAM_CHAT`，且目标 ASAP 环境已放行该 Artifact 的 `dsv41flash` 路由（Agent Trace `debug.modelName` 及服务端 digest）。
