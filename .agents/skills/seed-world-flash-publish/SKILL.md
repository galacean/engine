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
4. **确认 CDN 上传凭据可用（涉及新增/改动资产时）**：仅检查 `~/.config/galacean-flash-app/afts.env` 文件是否存在（禁止读取、打印或透出凭据内容）；缺失且需要 `--apply` 上传时，引导用户用 `world/scripts/set-flash-app-cdn-secret.sh` 初始化。

## 2. 环境与构建

在所选 Engine 仓库根目录执行（Node.js ≥ 20.19，pnpm 9.3.0）：

1. **刷新引擎与着色器预编译产物**（`build:seed-world-flash-app` 只检查 `.cache/shaders.ts` 是否存在，不会校验内容是否过期）：
   - 缺少 `packages/modify/.cache/shaders.ts`、刚刚 `pull` / `rebase` / 切换分支，或改动涉及 `packages/modify` / `packages/shader` 时，先执行：
     ```bash
     pnpm b:module
     pnpm --dir world prepare:engine
     ```
   - 若改动涉及被地形引用的公共 `ShaderLibrary/*.glsl`（如 `Shadow.glsl`、`Fog.glsl`、`Light.glsl`、`VolumetricCloudShadow.glsl`）或 `packages/terrain/src/shaders/**`，还须重编 4 个 Seed World 地形着色器（`prepare:engine` 不会更新它们）：
     ```bash
     node world/scripts/prepare-terrain-shaders.mjs Grass Surface Terrain Vegetation
     ```
2. **构建闪应用产物并完成 CDN 增量收敛**：
   ```bash
   pnpm --dir world build:seed-world-flash-app
   # 干跑检查新增/改动资产与合并文本包是否均已同步至 mdn.alipayobjects.com
   "$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py
   ```
   - 若 `pending upload` 非 0，执行：
     ```bash
     "$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py --apply
     pnpm --dir world build:seed-world-flash-app
     ```
     **注意两轮收敛**：改动 `.shaderc`、纹理或 `project.json` 时，第 1 轮 `--apply` + 重编会改写 `project.json` 中的 CDN URL，从而改变合并文本包 `seed-world-project-text-bundle-*.json` 的哈希；需再干跑检查并在需要时执行第 2 轮 `--apply` + `build:seed-world-flash-app`，直到 `pending upload: 0` 且构建日志不再出现 `Local CDN-eligible asset(s) not yet in flash-app-cdn-manifest.json` 告警。
3. **构建可重建源码快照**（必须严格在步骤 2 收敛至 `pending upload: 0` 之后执行，确保快照中的 `flash-app-cdn-manifest.json` 与最终产物一致）：
   ```bash
   pnpm --dir world build:seed-world-flash-source
   ```
   - 唯一允许作为 `--project-dir` 的目录是 `world/dist/seed-world-flash-app`（根目录直接含 `index.html`、`base: "./"`、所有 Worker 经 classic Blob `importScripts(...)` 引导、chunk 中无未替换的 `__SEED_WORLD_PROJECT_TEXT_BUNDLE_URL__` 且无相对路径 `new URL(..., self.location)`、PUGC 不支持扩展名已转为 `.wasm` 物理后缀、大资产与文本包已走 `mdn.alipayobjects.com`）。
   - 唯一允许作为 `--source-dir` 的目录是 `world/dist/seed-world-flash-source`（已通过未压缩构建逐文件 SHA-256 一致性校验与 `< 100 MiB` 压缩体积门禁；旁边的 `.tar.gz` 仅作体积证据，不传给发布器）。
   - 若两份产物刚刚基于当前完全一致的工作树构建完成且用户确认复用，可跳过重复构建，但须核对产物存在且无新源码改动。

## 3. 本地静态冒烟（可选）

若用户要求发布前先验证画面，用临时静态服务起在 `world/dist/seed-world-flash-app`：

```bash
python3 -m http.server 4180 --bind 127.0.0.1 --directory world/dist/seed-world-flash-app
```

访问 `http://127.0.0.1:4180/?aiChat=1&bootTrace=1`（排查渲染或性能可改用 `?debug=1&view=3d&bootTrace=1`）核对 3D 加载、首屏阶段 trace、text bundle 命中、无 404 与无 Worker 报错，完成后立即关闭该临时 HTTP 服务。`python3 -m http.server` 无 gzip 压缩，仅适合功能冒烟（测真实传输耗时/体积需使用带 gzip 的静态服务）；普通静态页无 ASAP 通道，不代表线上 AI Chat 已验收。

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
- Engine 路径、分支、commit、是否存在未提交改动（若本次 `--apply` 更新了 `world/demos/seed-world/flash-app-cdn-manifest.json`，明确提醒提交该清单文件，避免后续重复上传或哈希漂移）；
- 产物统计（`world/dist/seed-world-flash-app` 文件数与体积、`world/dist/seed-world-flash-source` 源码体积与压缩包体积）；
- 发布结果：`artifactId`、`artifactVersion`、Entry URL（不输出任何凭据或私钥）。

并明确提醒用户完成线上侧验收：
1. 打开 Entry URL，确认已注入本次 `window.artifactId` / `window.artifactVersion`，进入 3D 验证 AI Chat。
2. 如需更新已有正式分享链接，必须在灵光侧重新执行正式发布 / 上架，并确认分享页内层 `meta[name="flash-app-html-url"]` 与主 JS hash 已切到本次 Entry。
3. 核对线上能力声明允许 `AI_STREAM_CHAT`，且目标 ASAP 环境已放行该 Artifact 的 `dsv41flash` 路由（Agent Trace `debug.modelName` 及服务端 digest）。
