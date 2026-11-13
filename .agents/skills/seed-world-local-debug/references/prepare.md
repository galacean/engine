# 阶段一：环境准备

## 1. 定位或获取源码

先读 Engine 的 `README.md`、`world/README.md`，以及 ASAP 的 `AGENTS.md` 和相关 README。
检查已有 checkout 的 remote、branch、HEAD、工作树状态及 `git worktree list`，不要只根据目录名判断身份。
没有目录时让用户选择工作目录；不要覆盖已有目录、自动 stash 或 reset。

| 仓库 | 来源 | 默认远端分支 |
| --- | --- | --- |
| Engine | `git@github.com:galacean/engine.git` | `experimental/engine-next` |
| ASAP | `git@code.alipay.com:recneptune-tenants/asap-service.git` | 见 [SKILL.md](../SKILL.md) 的默认 ASAP 来源 |

两个仓库的 clone、fetch、分支和 worktree 操作使用原生 Git。
ASAP 的 PR 查询等平台操作使用 `antcode`，不要用 `gh`；只做 Git 同步不要求安装 antcode。
仓库鉴权失败时报告具体错误，不默默改用旧 checkout。

拿到最新 remote-tracking ref 后，可在新目录创建本地调试 worktree：

```bash
# 分别在对应仓库执行；目录由用户选择，分支已存在时先检查而非覆盖。
git worktree add -b codex/seed-world-local-debug /chosen/path/engine-debug origin/experimental/engine-next
git worktree add -b codex/seed-world-local-debug /chosen/path/asap-debug origin/<默认 ASAP 远端分支>
```

本地分支名不要求与远端一致；基线与同步目标必须明确。
默认 ASAP 分支变化后，先检查已有 worktree 与新来源的祖先关系；可 fast-forward 时再同步并更新上游。
ASAP 基线变化后，按第 3 节重新安装依赖，并按第 4 节检查本地配置。
后续更新用 fetch 后 fast-forward；有分叉或未提交改动时停下说明，不自动丢弃或合并。
记录 fetch 时间和两个 HEAD；未 fetch 时不能称“远端最新”。

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

检查 Engine `packages/ai-chat/src/ai-chat/asap-chat.ts` 的本地请求身份，以及 `world/demos/seed-world/assistant/SeedWorldModel.ts` 的模型入参。
当前本地身份是 `ai-chat-local`，目标入参是 `dsv41flash`。
ASAP 必须已注册公共模型 `DeepSeek-V4.1-Flash`，使用 `ant_high_assurance_asap` 凭据引用；注册配置包含 Provider 和推理参数，不能只添加请求别名映射。
注册缺失时先同步默认 ASAP 分支，不在本地临时重建模型注册。
ASAP 默认配置可能已有模型映射，但没有放行本地身份，此时请求会回退到默认 Ling 模型。
本地联调准备应主动补齐所选 ASAP worktree 的 `config/biz_config/dev/common_config.local.yaml`，这是正常环境准备，不需要另行申请修改生产配置的授权。
先确认该 checkout 的配置加载器支持 dev 的 `*.local.yaml`；若不支持，报告版本差异，不修改共享配置绕过。

需要保证的配置如下（只展示相关项，不是覆盖整份文件的模板）：

```yaml
mini_app_ai_chat_model_mapping:
  dsv41flash: "DeepSeek-V4.1-Flash"
mini_app_ai_chat_model_mapping_enabled_artifact_ids:
  - "ai-chat-local"
```

默认或 dev 配置已有正确模型映射时，不必在本地文件重复添加；缺少时才补齐此映射。
已有 local 配置若仍将 `dsv41flash` 指向旧专属模型，删除该项以继承正确默认值，或将该项更新为公共模型；保留其他本地配置。
修改前读取 default、dev 和已有 local 配置，保留其他字段与映射；该白名单列表会被覆盖而非自动追加，因此本地列表应保留这些配置中已有的身份，再去重加入 `ai-chat-local`。
不要重复定义同一个 YAML 键，也不要整文件覆盖同事已有配置。
该文件只在 dev 环境加载，通常被 Git 忽略，不随 clone/pull 分发；每个新 checkout 都需要准备，不提交个人配置，不复制凭据或冒用线上 Artifact ID。
文件修改后重启对应 ASAP 服务；已启动的旧进程不保证重新加载。

检查 ASAP 生效配置，而非只看默认 YAML：

- `common_config.mini_app_ai_chat_model_mapping` 应将 `dsv41flash` 映射到 `DeepSeek-V4.1-Flash`。
- `params.mini_app_ai_chat_model_setting_overrides` 应为公共模型配置 `max_tokens: 65536`，通用默认值保持 `8000`。
- `common_config.mini_app_ai_chat_model_mapping_enabled_artifact_ids` 应允许实际本地身份。
- 请求级 `mock_darwin_params`、环境变量、远端配置可能覆盖默认文件；不得在 URL 中偷偷加模型强制覆盖来掩盖问题。

本地身份未放行时先完成上面的 dev 本地配置；若生效配置仍被请求级或其他运行时配置覆盖，查明覆盖来源，不通过 URL 注入强制模型来掩盖问题。
Tool 信封支持缺失属于版本或兼容代码问题，需单独报告，不在环境准备中擅自修改协议。
原生 `read` / `execute` 等 Tool 定义可能经过版本化 `responseFormat` 信封穿过旧壳，ASAP 再解包；不要改回 JSON 决策协议。

准备阶段完成只代表可以尝试启动；实际路由仍必须在下一阶段通过 Trace 验证。
