# 阶段二：启动与调试

## 启动前核对

确定 Engine、ASAP 的实际目录、Python 解释器和两个端口。
按[环境准备](prepare.md#1-定位或获取源码) fetch 所选来源分支，核对实际 HEAD 与同步差距；用户指定版本或保留 WIP 时记录差异，不强制更新。
新终端重新设置下例路径变量，不假设变量会跨终端继承。
检查 `SERVER_ENV`、`TEST_UID`、`PYTHONPATH` 是否意外继承了另一环境；不打印其他敏感环境变量。
ASAP 本地启动不加 `--server-env prod/prepub/gray`，默认走 dev。
首次启动或更换 checkout 时，先完成 [dev 本地模型配置](prepare.md#4-模型与协议前置检查)；已有服务若启动早于配置修改，应重启后再验收。

macOS 用 `lsof -nP -iTCP:4173 -sTCP:LISTEN` 和 `lsof -nP -iTCP:8082 -sTCP:LISTEN` 检查占用。
对已存在的 PID，用 `ps -p <PID> -o pid,ppid,command`、`lsof -a -p <PID> -d cwd` 核对启动命令和工作目录；Linux 可检查 `/proc/<PID>/cwd`。
正确且版本一致的服务可复用；不能因为占用了端口就杀进程。
无关服务保留并选择其他空闲端口，完整 URL 随之重新生成。

## 终端 A：Engine

```bash
ENGINE_ROOT=/chosen/path/engine-debug
cd "$ENGINE_ROOT"
BROWSER=none pnpm --dir world dev --host 127.0.0.1 --port 4173 --strictPort
```

`world/vite.config.mjs` 默认使用 5193 端口并自动打开裸页面。这里用参数固定端口，并用 `BROWSER=none` 阻止打开；不要改用 `--open false`，它会打开 `/false`。
等待 Vite ready，保持前台进程存活。

## 终端 B：ASAP

```bash
ASAP_ROOT=/chosen/path/asap-debug
cd "$ASAP_ROOT"
.venv/bin/python web/app.py --port 8082
```

使用该 worktree 的解释器和当前目录；不要通过另一 checkout 的 app.py 启动。
等待 `Application startup complete` 和 `Uvicorn running`，仅出现“服务器启动于端口”不算完成。
保留终端或受管理的执行会话，记录 PID、cwd、commit、启动时间。
服务一般监听 `0.0.0.0`；这是开发服务，不配置公网隧道或对外暴露。

## 生成地址和 HTTP 检查

将 `SKILL_DIR` 设为本 Skill 的安装目录；调用方要从正在读取的 SKILL.md 所在目录解析它，不硬编码其他人的路径。
将 `ASAP_SOURCE_REF` 设为 `origin/` 加 [SKILL.md](../SKILL.md) 中的默认 ASAP 分支；用户指定其他来源时使用该来源。

```bash
python3 "$SKILL_DIR/scripts/preview.py" \
  --engine-root "$ENGINE_ROOT" --asap-root "$ASAP_ROOT" \
  --asap-source "$ASAP_SOURCE_REF" \
  --frontend-port 4173 --backend-port 8082 --check
```

脚本输出两个 checkout 的版本、与来源分支的差距及 URL。
`behindSource` 大于 0 表示 checkout 缺少来源分支上已 fetch 的提交；先向用户说明缺少哪些提交，再决定是否更新。
`behindSource` 为 `null` 表示找不到来源引用；用 `--engine-source` 或 `--asap-source` 指定。
输出里的 `mini_app_url` 与 `app_shell_url` 是同一个直接 Demo 地址，包含 `aiChat=1&agentTrace=1`。
每次生成附带新的调试 revision，避免重复使用历史链接；revision 只是缓存标记，不是已验证产物身份。
不传 `--check` 只生成，不发网络请求。
HTTP 失败时不要继续宣称可调试；查看对应终端。

用正常浏览器/用户指定浏览器打开输出的 Wrapper URL，而不是 4173 的裸页面。
不要新建临时浏览器配置后声称是同事平时的浏览器。
打开页面后核对 Network 中 Demo URL、加载资源、控制台错误和 3D 初始化情况。

## 最小真实验收

1. 进入 3D 后打开 Agent Trace，先用指令编辑器输入“现在世界里是几点？”验证文本链路，排除 ASR 干扰。
2. 输入“把时间改成下午三点”验证实际 API 执行；这会修改当前测试场景，若用户只授权打开页面则不要代发，交由用户验收。
3. 检查 Trace 的请求模型 `dsv41flash` 和响应 `debug.modelName`；必要时对照本地 `logs/asap-service/trace.log` 中同一个 trace ID 的 LLM 节点/digest，实际模型应为公共 `DeepSeek-V4.1-Flash`。
4. 确认 `read` / `execute` 原生 Tool Call、`tool_call_id` 对应结果及最终 Assistant 回复；上下文已有声明时可不重复读取，不能强制固定调用序列。
5. 检查 Tool 结果与 `worldAfter` 时间是否匹配，不能只凭“修改成功”的文案判通过。

接口 HTTP 200、前端 requestedModel、URL 参数和 System Prompt 都不能单独证明实际模型路由。
如果没有实际模型证据，写“模型待验证”，不要推定默认路由正确。
只有文本回复且 `toolCalls` 为空时，只能确认文本链路，不能判定工具执行通过。
本地调用公共模型成功不代表预发或生产服务地址已验收，也不代表图片、长上下文和并发额度已验证。
如需语音，再授权麦克风并按住 Siri 球测试，分别记录 ASR 和 LLM 结果；Web ASR 不可用不代表手机原生壳同样不可用。
Trace 可能含用户内容和内部信息，只保存/分享必要的脱敏证据。

## 改动后的回归验收

Engine 的 AI Chat 或 ASAP 有改动时，在最小真实验收之后由用户逐条执行。每条都在 Agent Trace 里核对。

| 范围 | 指令或操作 | 通过标准 |
| --- | --- | --- |
| 跨指令历史 | 先发“把时间改成下午三点”，再发“再往后调两个小时” | 结果是下午五点 |
| 多步 Tool | 把天气改成下雨，季节改成秋天，然后告诉我现在的时间、天气和季节 | 每个 Tool Call 都有对应结果，最终回复和画面一致 |
| 图片 | 拍一张当前画面，告诉我画面里有什么 | 调用了 `snapshot`，回复描述的是当前画面 |
| 停止 | 发“在我面前种十棵树，每次只种一棵”，等它开始调用 Tool 后点停止 | 立刻停下，之后不再出现迟到的回复或 Tool 结果 |
| 停止后继续 | 停止后直接发“现在几点？” | 新指令正常执行 |
| 立即停止 | 再发一次长指令，一秒内点停止 | 停下，不报错，不停留在“执行中” |
| 上下文压缩 | 先按下面的命令调低预算，再发“把 skills 目录下每个技能的说明文档都读一遍，最后分别用一句话总结” | Trace 计数面板出现 `compacted`，任务仍然完成，总结包含最早读的技能，模型没有把摘要当成新指令 |

调低和恢复压缩预算的控制台命令见 Engine 的 `packages/ai-chat/src/ai-chat/README.md`，搜索 `setContextCompactionBudget`。测完恢复默认。
429 和超时无法手动触发，由自动测试覆盖；交付时写明这一点。

## 停止、更新与故障定位

- 停止：对应前台终端 `Ctrl+C`；脱离终端时仅对已核实属于本次调试的 PID 发 `TERM`，不使用宽泛 `pkill node/python/chrome`。
- Engine 源码编辑：等待 Vite HMR 或页面重载；依赖或引擎产物变化时按 `world/README.md` 重新准备。
- ASAP 编辑或更新：正常模式不保证自动重载；停止正确 PID 后从同一目标目录重启，重新记录 commit。
- Node 版本太低：修正当前终端的 Node/PATH，再启动；不要重写用户全局 shell 配置。
- Vite `esbuild service is no longer running`：检查进程退出原因，再重启该 Vite；不要删除用户浏览器缓存。
- CandyJar 缺失/调用超时：先确认完整 Wrapper 链路、两个 URL 参数一致、主机名一致、没有额外 iframe，再检查后端日志。
- 路由成 Ling：先按环境准备补齐 dev 本地身份放行、重启对应进程，再核对生效映射和请求级覆盖；不能通过旧实验分支冒充目标分支已修复。
- Tool 定义缺失：核对前端信封、本地壳转发和 ASAP 解包三处；不要新增临时代理或另一条请求链路。
- 429/超时：保留 trace ID 与错误，检查既有重试/预算，不连续高频重发，更不要自动开始批量测试。

交付时写清楚哪一层已通过、哪一层未验证；同事可直接使用返回 URL 继续调试。
