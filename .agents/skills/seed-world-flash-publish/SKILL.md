---
name: seed-world-flash-publish
description: 将 Seed World 构建为灵光闪应用产物与可重建源码快照，校验根入口、classic Worker 与 PUGC 扩展名兼容，并通过 pugc-flash-app-2 完成上传、注册与线上验收指导。触发词：发布这个闪应用、发布闪应用、发布成灵光闪应用、更新闪应用、灵光闪应用上架。不用于本地 ASAP/Wrapper 联调（见 seed-world-local-debug）。
---

# Seed World 灵光闪应用发布

仅要求创建、修改或解释本 Skill 时，不执行构建或发布。
完整原理、参数说明与故障排查见 [FLASH_APP_PUBLISH.md](../../../world/demos/seed-world/FLASH_APP_PUBLISH.md)。

## 1. 发布前核对

1. 选定 Engine 提交，记录路径、分支和 HEAD。用独立 Git 工作树做 npm 发布构建。若要纳入当前未提交的应用源码，明确范围并应用到发布工作树。影响源码快照重建的原生引擎改动须纳入所选提交。
2. 仅打包时执行第 2 节。发布时还需定位含 `scripts/deploy.cjs` 和 `scripts/asap-publish.cjs` 的 PUGC checkout，以及具备发布依赖的 ASAP checkout。
3. 按 `scripts/app-context.local.json` 校验发布器绑定。已有应用使用同一 Artifact。首次创建须确认新建意图和标题。发布前查询当前 Artifact 类型和线上最新版本，按实际登记类型传入 `--type`，并对齐本地待发布版本号。

## 2. 使用 npm 打包

在 Node.js ≥ 20.19、npm 10.9.3 环境执行以下命令。示例从当前 HEAD 创建发布工作树。

```bash
git worktree add --detach ../seed-world-npm-release HEAD
cd ../seed-world-npm-release
node world/scripts/build-seed-world-npm.mjs
```

脚本在该工作树生成 npm workspace 配置和 `package-lock.json`，执行 `npm ci`，重新编译引擎和地形着色器，然后生成两份产物。工程开发继续使用仓库原有的 pnpm 配置。

- `world/dist/seed-world-flash-app` 是运行目录，根部包含 `index.html`。构建会校验相对路径、classic Worker、资源清单和 PUGC 扩展名。
- `world/dist/seed-world-flash-source` 是源码目录，附带 npm 锁文件和重建步骤。脚本会比较两次未压缩构建的逐文件 SHA-256，并校验源码归档不超过 100 MiB。
- 仅交付运行压缩包时执行 `COPYFILE_DISABLE=1 tar -czf world/dist/seed-world-flash-app.tar.gz -C world/dist/seed-world-flash-app .`。

若需增量同步 CDN，在发布工作树内先运行 `"$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py` 检查待上传资产。使用已配置的 AFTS 凭据执行 `--apply` 后，用 `npm run build:seed-world-flash-app --workspace world` 重建。合并文本包哈希随引用 URL 变化时继续检查并同步。CDN 清单收敛后重跑 `npm run build:seed-world-flash-source --workspace world`，让源码快照与发布产物一致。

## 3. 本地静态冒烟（可选）

若用户要求发布前先验证画面，用临时静态服务起在 `world/dist/seed-world-flash-app`：

```bash
python3 -m http.server 4180 --bind 127.0.0.1 --directory world/dist/seed-world-flash-app
```

访问 `http://127.0.0.1:4180/?aiChat=1&bootTrace=1`（排查渲染或性能可改用 `?debug=1&view=3d&bootTrace=1`）核对 3D 加载、首屏阶段 trace、text bundle 命中、无 404 与无 Worker 报错，完成后立即关闭该临时 HTTP 服务。`python3 -m http.server` 无 gzip 压缩，仅适合功能冒烟（测真实传输耗时/体积需使用带 gzip 的静态服务）；普通静态页无 ASAP 通道，不代表线上 AI Chat 已验收。

## 4. 执行 PUGC 发布

发布依赖 `asap-service` 的 Python 3.10+ 环境（如 `$ASAP_SERVICE_DIR/.venv/bin/python`）和当前 OSS 发布凭据。令 `ENGINE_WORKTREE_ROOT` 指向完成 npm 构建的发布工作树，`APP_TYPE` 使用已有 Artifact 的登记类型。

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
    --type "$APP_TYPE" \
    --app-key flash-app \
    --timeout 300
```

完成 OSS 上传、数据库注册和 Entry URL 校验后再交付版本。雨燕已返回入口但登记失败时，核对线上版本、入口注入的 ID 和版本以及 OSS 备份。确认该版本尚未登记后，复用已生成的入口重试登记。

## 5. 交付与发布后验收清单

交付时报告：
- Engine 路径、分支、commit、是否存在未提交改动（若本次 `--apply` 更新了 `world/demos/seed-world/flash-app-cdn-manifest.json`，明确提醒提交该清单文件，避免后续重复上传或哈希漂移）；
- 产物统计（`world/dist/seed-world-flash-app` 文件数与体积、`world/dist/seed-world-flash-source` 源码体积与压缩包体积）；
- 发布结果：`artifactId`、`artifactVersion`、Entry URL（不输出任何凭据或私钥）。

并明确提醒用户完成线上侧验收：
1. 打开 Entry URL，确认已注入本次 `window.artifactId` / `window.artifactVersion`，进入 3D 验证 AI Chat。
2. 如需更新已有正式分享链接，必须在灵光侧重新执行正式发布 / 上架，并确认分享页内层 `meta[name="flash-app-html-url"]` 与主 JS hash 已切到本次 Entry。
3. 核对线上能力声明允许 `AI_STREAM_CHAT`，且目标 ASAP 环境已放行该 Artifact 的 `dsv41flash` 路由（Agent Trace `debug.modelName` 及服务端 digest）。
