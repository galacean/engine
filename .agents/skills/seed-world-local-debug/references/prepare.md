# 阶段一：环境准备

## 1. 定位或获取源码

先读 Engine 的 `README.md`、`world/README.md`，以及 ASAP 的 `AGENTS.md` 和相关 README。完整联调还需阅读壳仓库的 `AGENTS.md`。
检查已有 checkout 的 remote、branch、HEAD、工作树状态及 `git worktree list`，不要只根据目录名判断身份。
没有目录时让用户选择工作目录；不要覆盖已有目录、自动 stash 或 reset。

| 仓库 | 来源 | 默认远端分支 |
| --- | --- | --- |
| Engine | `git@github.com:galacean/engine.git` | `codex/seed-world-action-probe` |
| ASAP | `git@code.alipay.com:recneptune-tenants/asap-service.git` | 见 [SKILL.md](../SKILL.md) 的默认 ASAP 来源 |
| flash-app | `git@code.alipay.com:ASAPlat/flash-app.git` | `codex/seed-world-action-probe`（壳 #279） |

三个仓库的 clone、fetch、分支和 worktree 操作使用原生 Git。
ASAP 的 PR 查询等平台操作使用 `antcode`，不要用 `gh`；只做 Git 同步不要求安装 antcode。
仓库鉴权失败时报告具体错误，不默默改用旧 checkout。

拿到最新 remote-tracking ref 后，可在新目录创建本地调试 worktree：

```bash
# 分别在对应仓库执行；目录由用户选择，分支已存在时先检查而非覆盖。
git worktree add -b codex/seed-world-local-debug /chosen/path/engine-debug origin/codex/seed-world-action-probe
git worktree add -b codex/seed-world-local-debug /chosen/path/asap-debug origin/<默认 ASAP 远端分支>
```

本地分支名不要求与远端一致；基线与同步目标必须明确。
默认 ASAP 分支变化后，先检查已有 worktree 与新来源的祖先关系；可 fast-forward 时再同步并更新上游。
ASAP 基线变化后，按第 3 节重新安装依赖，并按第 4 节检查本地配置。
后续更新用 fetch 后 fast-forward；有分叉或未提交改动时停下说明，不自动丢弃或合并。
记录 fetch 时间和各仓库 HEAD；未 fetch 时不能称“远端最新”。

### 2026-11-26 本地联调版本记录

下表记录当次完整壳预览使用的工作树，后续启动仍用 `preview.py --check` 核对实际 HEAD 和未提交改动。

| 仓库 | 本地 HEAD | 当次状态 |
| --- | --- | --- |
| ASAP（#13282 分支） | `43671da5b78cd4830cc76da5412bf32a9f2d4509` | 比远端 `b93b0251b53a` 领先 5 个提交，工作树有未提交改动 |
| flash-app 壳（#279） | `fb699d59cfdd95f8017cef80b2fd270c6594c7f9` | 工作树干净，与远端一致 |
| Engine | `392cfed7f8866661cc29b33ee6d1b980838b6d04` | HEAD 与远端一致，启动使用了未提交的 Engine 和 skill 改动 |

本次从壳 HEAD 重建的 SDK 与本地 HTTP 服务返回的 SDK 字节一致，SHA-256 为 `52c34297e5c9d369b04f5fd7ea4d8b6bd97d9577da1bfea1fae362cc07d7d139`。

## 2. Engine 环境

读取所选源码的 `package.json`、`world/package.json` 和 `world/README.md`。Seed World 位于 pnpm workspace 的 `world/demos/seed-world`，系统代码位于 `packages/*`。
Node 至少满足项目 `engines`（当前 `>=20.19.0`，推荐 Node 22 LTS）；pnpm 使用 `packageManager` 指定版本（当前 `9.3.0`）。
通过同事自己的 Node 版本管理器选择版本，不依赖系统 Node 20.10 或他人的 nvm 路径。
两个终端都检查 `node --version`、`pnpm --version`。

首次准备时，在所选 Engine worktree 的根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm b:module
pnpm --dir world prepare:engine
```

`b:module` 生成模块产物，`prepare:engine` 准备世界编辑所需的编译器与运行时产物。
缺少 `@galacean/engine-shader-parser/internal` 或 `dist/main.analyzer.js` 时，先完成 `b:module`，再运行 `prepare:engine`；仅运行后者不能证明依赖齐全。
更新锁文件后重新安装；引擎包改动后按实际影响重建模块及执行 `prepare:engine`。
已有与源码一致的产物时复用；仅修改由 Vite 直接加载的 Demo 源码时无需重新准备。
单纯启动调试不追加全局测试。
`node_modules` 由其他 pnpm 版本安装时，`pnpm install` 可能提示清理目录，无终端交互时会一直等待。遇到时停下说明，不自动清理。

## 3. ASAP 环境

必须以**选中的 ASAP 分支 worktree**里的 `docs/dev-guide/setup_guide.md`、`requirements.txt` 为准，不使用另一个实验分支的依赖说明。
当前推荐 Python 3.10，运行环境建在该 checkout 的 `.venv`，避免共享另一个分支的 editable 安装。
macOS 需 Command Line Tools；项目需要 `qjs` 时可通过 Homebrew 的 `quickjs` 安装并用 `qjs --help` 验证。

典型 uv 安装路径（使用已经准备好的 Python 3.10）：

```bash
cd /chosen/path/asap-debug
uv venv --python 3.10 .venv
uv pip install --python .venv/bin/python -r requirements.txt
uv pip install --python .venv/bin/python -r requirements-dev.txt
npm install
.venv/bin/python --version
```

有现成 `.venv` 时先检查解释器，不重新覆盖。
依赖含内部包，需要同事自己的内网/VPN、包源和仓库访问权限；网络/鉴权失败不等于代码错误。
配置按 setup guide 及 `.env.default`/模板处理；不复制他人的 `.env`、AK、cookie、secret cache 或 UID。
本地 dev 的密钥获取可经过 `framework/config/ak_manager.py` → `MistHttpClient`；拿不到配置/模型密钥时根据报错向服务负责人申请，不打印密钥调试。

## 4. 模型与协议前置检查

检查 Engine 的 `packages/ai-chat/src/ai-chat/asap-chat.ts` 与 Seed World 调用入口，确认普通游戏请求使用 `seedWorldStream`。
检查本机实际源码。若游戏仍依赖 `seedWorldAction=1` 开关，应选用已默认调用专用 action 的 Engine 工作树再验收完整游戏。
本地游戏预览依赖 Wrapper 的 `FlashApp.remoteStreamSkill` 转发 `lingguang.ai.seedWorldStream`，停止请求走 `FlashApp.remoteSkill` 的 `lingguang.ai.stopChat`。
正式游戏依赖壳 SDK 的 `window.lingguang.ai.seedWorldStream` 和 `window.lingguang.ai.seedWorldStop`。检查预发真机实际加载的 SDK 是否同时暴露两个方法。
确认所选 ASAP 服务已注册 `seed_world_stream_agent`。
ASAP 的 `biz/seed_world_stream_agent/agent.py` 指定模型 `aisearch_dsv41flash`。
启动后按[启动与验收](start.md)核对实际响应和服务端 Trace。

## 5. 壳仓库和 SDK

用调试同学自己的 AntCode 账号申请 [flash-app](https://code.alipay.com/ASAPlat/flash-app) 读取权限。
已有 checkout 时复用对应工作树。首次获取执行以下命令，路径可以调整。

```bash
git clone --branch codex/seed-world-action-probe git@code.alipay.com:ASAPlat/flash-app.git /chosen/path/flash-app
cd /chosen/path/flash-app
npm install
npm run build:base
```

按壳仓库要求使用 Node 22。
核对本次构建生成了 `dist/base/base.js`。启动脚本会单独构建该 checkout 的开发版 app-shell。
`dist/base.js` 是占位文件；浏览器回归读取 `dist/base/base.js`。
实际游戏预览还要核对 AppLoader 为应用 iframe 注入的 SDK URL。
当前版本在 `src/lib/AppLoader.ts` 的 `iframeHeadInjectionBase` 指定该 URL，单独托管 `dist/index.html` 不会自动切换到同目录的 SDK。
按[终端 A](start.md#终端-aengine-和壳)运行本 Skill 的启动脚本，会把调试副本的注入地址绑定到该 checkout 的 SDK。
本地回归可直接使用下一阶段的壳仓库脚本，无需发布壳或修改远端配置。
