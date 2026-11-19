# Seed World 灵光闪应用构建与发布指南

本文说明如何在当前 monorepo 结构下，将 Seed World 构建为可上架的灵光闪应用产物与受控源码快照，并通过内部 PUGC 发布工具完成上传、注册与线上验收。

若希望由 Agent 直接执行发布流程，可直接对 Agent 说“**发布这个闪应用**”（对应 Skill：[`.agents/skills/seed-world-flash-publish/SKILL.md`](../../../.agents/skills/seed-world-flash-publish/SKILL.md)）。本地 AI Chat / ASAP Wrapper 联调不属于线上发布流程，见 [`.agents/skills/seed-world-local-debug/SKILL.md`](../../../.agents/skills/seed-world-local-debug/SKILL.md)。

## 1. 前置环境

在仓库根目录准备环境（Node.js ≥ 20.19，pnpm 9.3.0）：

```bash
pnpm install --frozen-lockfile
pnpm b:module
pnpm --dir world prepare:engine
```

`prepare:engine` 会生成 `packages/modify/.cache/` 下的着色器与编译产物；修改 `packages/modify` 替换文件或着色器源码后需重新执行。

## 2. 构建闪应用产物

```bash
pnpm --dir world build:seed-world-flash-app
```

唯一应发布的产物目录是：

```text
world/dist/seed-world-flash-app
```

构建脚本（`world/scripts/build-seed-world-flash-app.mjs`）会自动完成构建并校验以下闪应用硬约束：

- **根入口与相对路径**：目录根部直接包含 `index.html`，Vite `base` 为 `./`，所有资源均以相对路径引用（不出现 `/assets/` 或 `../`），可部署到 `render.lingguangcontent.com` 任意嵌套路径，并兼容主页面与静态资源分属 `lingguangcontent.com` / `lingguangobjects.com` 的场景。
- **Worker 跨源与移动 WebView 兼容**：`worker.format` 为 classic IIFE，且闪应用构建插件会把所有 emitted Worker 统一改写为同源 classic Blob `importScripts(...)` 引导（并注入 `self.__FLASH_APP_WORKER_BASE_URL__` 供 Worker 内相对资源解析）。这既避免 `about:srcdoc` / 跨域 CDN 下的 `SecurityError`，也兼容钉钉 UWS 等不支持 `{ type: "module" }` Worker 的移动 WebView。脚本会通过 `vm.Script` 逐个核验所有 Worker 均为合法 classic JavaScript，且不存在残留的 `{ type: "module" }` Worker 构造调用。
- **PUGC 物理扩展名兼容**：语燕 / PUGC 会忽略 `.asset`、`.br`、`.f32le`、`.r8`、`.r16`、`.rgb8`、`.treewind` 等物理后缀。构建时保留原始字节与 `virtualPath`，仅为物理发布路径追加 `.wasm` 后缀并同步重写 `project.json` / `production-catalog.json` 中的 `path` 字段。
- **独立运行时闭包**：排除无关的 Grasslands 预计算数据，校验 Seed World `project.json`、`production-catalog.json` 及程序化植被清单引用的全部文件存在且非空（已迁移至 `mdn.alipayobjects.com` 的大体积清单与资源在 `project.json` 中改写为 `https://` URL）。
- **MDN CDN 资产分流与合并文本包**：构建插件会按 `world/demos/seed-world/flash-app-cdn-manifest.json` 的内容 SHA-256，将二进制资源、`esbuild.wasm`（上传为 `.bin` 别名）、`> 128 KiB` 植被结构 JSON 与合并后的小型项目文本包（`seed-world-project-text-bundle-*.json`）改写为 `mdn.alipayobjects.com` 不可变直链并从本地产物剔除，减少语燕托管体积并加速首屏拉取。若本次改动修改了着色器（如 `Terrain.shaderc`）、纹理、模型或项目清单，请在构建后执行增量 CDN 同步检查并重编直至 `pending upload: 0`：
  ```bash
  # 干跑检查待上传资产数量；非 0 时改用 --apply 上传并重新执行 build:seed-world-flash-app
  "$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py
  # 如需上传（密钥位于 ~/.config/galacean-flash-app/afts.env，可用 world/scripts/set-flash-app-cdn-secret.sh 初始化）
  "$ASAP_SERVICE_DIR/.venv/bin/python" world/scripts/sync-flash-app-cdn-assets.py --apply
  pnpm --dir world build:seed-world-flash-app
  ```
  > 若 `project.json` 的 CDN URL 发生变化，合并文本包 `seed-world-project-text-bundle-*.json` 的哈希会更新，再执行一次 `--apply` 与 `build:seed-world-flash-app` 即可收敛至 `pending upload: 0`。
- **`about:srcdoc` 地址兼容**：正式闪应用容器通过 sandbox iframe 的 `srcdoc` 运行入口，此时 `location.href` 为 `about:srcdoc`。页面已通过 `SeedWorldDocumentUrl` 读取宿主注入的 `meta[name="flash-app-html-url"]`，不会直接对 `about:srcdoc` 调用 `history.replaceState`。

> 不要把仓库根目录、`world/dist/seed-world`（普通多 Demo 目录结构，入口在 `world/demos/seed-world/index.html`）或 `node_modules` 当作闪应用产物目录发布。

## 3. 构建可重建源码快照

发布器使用的 `--source-dir` 必须单独构建，不能直接传入整个引擎仓库 worktree：

```bash
pnpm --dir world build:seed-world-flash-source
```

构建脚本（`world/scripts/build-seed-world-flash-source.mjs`）会执行以下操作：

1. 将根 workspace 配置文件、`world/`（仅保留 `demos/seed-world` 与构建脚本）以及 13 个 World workspace 包复制到 `world/dist/seed-world-flash-source`。
2. 排除 `node_modules`、测试目录（`tests`、`e2e`）、构建缓存与无关 Demo、Grasslands 预计算数据，以及已有运行时 KTX2 派生物的制作源 PNG（如水体制作源图与 `prop-textures/source`），不删除任何运行时资源。
3. 写入 `REBUILD.md` 与 `SOURCE_SNAPSHOT.json`。
4. 通过临时链接原生引擎包与依赖，对当前仓库与源码快照各执行一次未压缩的闪应用 Vite 构建，逐文件比对文件集合与 SHA-256，确保两者字节级一致。
5. 生成 `world/dist/seed-world-flash-source.tar.gz` 校验压缩体积；压缩包超过 **100 MiB** 时命令直接失败。

成功后：
- 传给发布器 `--source-dir` 的目录是 `world/dist/seed-world-flash-source`。
- 旁边的 `world/dist/seed-world-flash-source.tar.gz` 仅作为本地体积门禁证据，无需传给发布器。

## 4. 本地静态冒烟验证（可选）

发布前可用普通静态服务器验证独立产物（普通静态页没有 ASAP 模型通道，仅用于验证 3D、资源加载与 Worker）：

```bash
python3 -m http.server 4180 \
  --bind 127.0.0.1 \
  --directory world/dist/seed-world-flash-app
```

浏览器打开：

```text
http://127.0.0.1:4180/?aiChat=1
```

核对控制台无 404 / Worker 报错，进入 3D 世界后地形、水体、植被、建筑与相机交互均正常。

## 5. 发布为灵光闪应用

发布使用内部 PUGC Flash App 发布工具管理 Artifact ID、版本、OSS 上传和数据库注册。**一个发布工具 checkout 只能绑定一个 Artifact**；首次发布新 Artifact 时必须用它自己的 `scripts/init-app-context.cjs` 初始化，不能借用其他应用的 `app-context.local.json`。

```bash
ENGINE_WORKTREE_ROOT=/absolute/path/to/engine
PUBLISHER_ROOT=/absolute/path/to/pugc-flash-app-2
ASAP_SERVICE_DIR=/absolute/path/to/asap-service

cd "$ENGINE_WORKTREE_ROOT"
pnpm --dir world build:seed-world-flash-app
pnpm --dir world build:seed-world-flash-source

# 仅首次创建该 Artifact 时执行；后续版本继续复用同一个发布工具 checkout。
test -f "$PUBLISHER_ROOT/scripts/app-context.local.json" || \
  node "$PUBLISHER_ROOT/scripts/init-app-context.cjs"

# `--type` 必须与已有 Artifact 在数据库中的记录类型一致（`miniapp` 或 `game`）。
# `ASAP_PYTHON` 指向已安装 `asap-service` 依赖的 Python 3.10+ 解释器（通常是 `.venv/bin/python`）。
env -u OSS_ACCESS_KEY_ID -u OSS_SECRET_ACCESS_KEY \
  ASAP_SERVICE_DIR="$ASAP_SERVICE_DIR" \
  ASAP_PYTHON="$ASAP_SERVICE_DIR/.venv/bin/python" \
  node "$PUBLISHER_ROOT/scripts/deploy.cjs" \
    --project-dir "$ENGINE_WORKTREE_ROOT/world/dist/seed-world-flash-app" \
    --source-dir "$ENGINE_WORKTREE_ROOT/world/dist/seed-world-flash-source" \
    --title "Seed World AIChat" \
    --type miniapp \
    --app-key flash-app \
    --timeout 300
```

## 6. 发布后验收与正式上架

发布只有在 **OSS 上传、数据库注册、Artifact 版本更新、Entry URL** 四部分全部成功后才算完成。

1. **Entry URL 核验**：打开本次生成的 Entry URL，确认页面已注入当前 `window.artifactId` 与 `window.artifactVersion`，再进入 3D 世界验证 AI Chat。
2. **正式分享链接更新**：PUGC 更新 Artifact 后，已有的正式分享链接仍可能固定在上一次上架的 Entry URL；必须在灵光侧重新执行正式发布 / 上架，并检查分享页内层 `meta[name="flash-app-html-url"]` 与主 JS hash 已指向本次 Entry，不能只验 Artifact 的最新 Entry。
3. **线上能力与 ASAP 模型路由核验**：
   - 线上能力声明需允许 `AI_STREAM_CHAT`（前端通过 `window.lingguang.ai.streamChat` 调用 ASAP，原生 Tool 字段通过版本化 `responseFormat` 信封透传）。
   - 前端固定请求 `model: "dsv41flash"`；目标 ASAP 环境必须允许当前 Artifact 使用 requested-model 路由，将 `dsv41flash` 映射到目标 DeepSeek V4.1 Flash 模型（如 `DeepSeek-V4.1-Flash` / `aisearch_dsv41flash`），并完整转发原生 Tool 定义、Assistant Tool Calls、Tool Results、`tool_call_id` 与 finish reason。
   - 验收时核对 Agent Trace 的 `debug.modelName`；如需完整路由证据，对照 ASAP 服务端 digest 中的 `requested_model=dsv41flash`、`model_name` 与 `model_route=requested_model`。

## 7. 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Missing packages/modify/.cache/shaders.ts` | 尚未准备引擎着色器缓存 | 在仓库根目录执行 `pnpm b:module && pnpm --dir world prepare:engine` |
| 独立产物进入 3D 后资源 404 | 发布了 `world/dist/seed-world` 或绕过了闪应用构建脚本 | 重新执行 `pnpm --dir world build:seed-world-flash-app`，只发布 `world/dist/seed-world-flash-app` |
| Entry URL 打开后脚本请求指向 `/assets` 或 `../../../assets` | 使用了普通 `pnpm --dir world build` 而非闪应用构建 | 使用 `pnpm --dir world build:seed-world-flash-app`，确认 `index.html` 位于产物根目录且引用 `./assets/...` |
| Chrome 正常，但钉钉 / 移动 WebView 卡在加载阶段或 Worker 报错 | Worker 使用了 `{ type: "module" }` 或跨源 URL | 重新运行 `build:seed-world-flash-app`，确保所有 Worker 均经 `flashAppClassicWorkers` 改写为 classic Blob `importScripts(...)` |
| Entry URL 请求 `.br`、`.r8`、`.r16`、`.rgb8`、`.f32le`、`.treewind`、`.asset` 等资源 404 | 绕过了 PUGC 物理扩展名兼容转换，或新增了未被 PUGC 收录的自定义扩展名 | 使用标准构建脚本；如为新增自定义扩展名，将其加入 `world/scripts/project-assets.mjs` 的 `PUGC_UNSUPPORTED_ASSET_EXTENSIONS` 并重新构建 |
| 源码备份超过 100 MiB | 直接把整个仓库传给了 `--source-dir`，或源码目录新增了未压缩制作源素材 | 使用 `pnpm --dir world build:seed-world-flash-source` 生成专用目录；若仍超限，排查新增制作源资产并在保留运行时派生物的前提下于脚本中排除 |
| Step 2 报 `TypeError: 请检查 asap-service 环境、依赖及发布权限` | `deploy.cjs` 默认调用系统 `python3`（缺少 `asap-service` 依赖或版本低于 3.10） | 显式传入 `ASAP_SERVICE_DIR` 与 `ASAP_PYTHON="$ASAP_SERVICE_DIR/.venv/bin/python"` |
| Step 5 报 `type 不匹配：已有记录为 'miniapp'，本次传入 'game'` | 复用已有 Artifact 时 `--type` 与数据库中首次注册的类型不一致 | 按报错提示改为匹配已有记录的 `--type`（`miniapp` 或 `game`）后重试 |
| 最新 Entry 正常，但正式分享页仍运行旧代码 | 正式分享记录固定在上一次上架的 Artifact Entry | 在灵光侧重新发布 / 上架当前 Artifact 版本，并核对分享页内层 `flash-app-html-url` 与主 JS hash |
| Trace 未路由到 DeepSeek V4.1 Flash 或无 Tool 调用 | Artifact 不在目标 ASAP 的 requested-model 白名单，或线上未开放 `AI_STREAM_CHAT` | 核对 Trace 的 `debug.modelName`、ASAP 服务端 digest、Artifact 白名单与线上能力声明 |
