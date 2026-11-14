---
name: sync-galacean-assets
description: 只读扫描 galaceanoss/assets/，将新增或更新的非蓝图资产发布到 CDN，生成召回目录并更新项目入口。用于增量同步、首次初始化资源库或恢复失败同步。状态和临时文件保存在项目外。
---

# Galacean 召回资产同步

本 Skill 读取 OSS 中已整理的资产，再发布到 CDN。
OSS 始终只读。不得上传、覆盖或删除 OSS 对象。
同步时不生成或改写资产描述。

用户提供本地文件、文件夹或压缩包时，使用 [资产入库 Skill](../import-galacean-assets/SKILL.md)。
该 Skill 负责检查素材和生成描述。用户确认后，它直接上传 CDN。

## 项目与环境

使用 [scripts/sync_assets.py](scripts/sync_assets.py)。
核对用户指定的 engine 工作树。目标项目必须包含 `packages/retrieval/src/retrieval/src/build.ts`。
不要根据历史绝对路径操作其他工作树。

Python 依赖见 [requirements.txt](scripts/requirements.txt)。优先使用已满足依赖的解释器。
缺少依赖时，在同步目录的 `.venv` 中安装。
Node 使用项目要求的版本。`packages/retrieval` 需要 `tsx` 和 `zod`，由 pnpm workspace 安装。

## 状态与互斥

同步目录放在项目外，例如 `~/.local/share/galacean-retrieval-sync/galaceanoss`。
同一来源和 CDN 命名空间持续使用同一目录。
同一资源库的所有本机发布任务共用该目录的排他锁。
不要另建状态目录绕过锁。

存在 `pendingIntake` 标记时，恢复原批准的入库批次。
不要删除标记强行同步。
受限测试使用独立的同步目录和输出配置，避免覆盖正式全库入口。

默认项目配置是 `packages/retrieval/src/retrieval/catalog.json`。
脚本只更新 `manifestUrl`，保留其他字段。
同步时间、对象清单、指纹、描述和上传映射保存在外部 SQLite 中。
这些记录不进入 Git、VFS 或 `project.json`。

## 账号与传输配置

OSS 只使用 `GAME_FACTORY_OSS_ACCESS_KEY_ID` 和 `GAME_FACTORY_OSS_ACCESS_KEY_SECRET`。
不要替换为 shell 中的其他 OSS 账号。

AFTS 需要 `AFTS_BIZSECRET`。密钥只保存在运行进程环境或密钥管理中。
不要将密钥写入 Skill、项目、报告或命令输出。
其他配置见 [存储协议](references/storage.md)。
缺少密钥时，可以执行可用的只读计划。不要将计划报告为已同步。

## 执行同步

用户要求“同步最新资产”，即授权本轮增量上传和项目入口更新。
不重复请求发布确认。仅要求创建或解释 Skill 时，不执行发布。

先生成扫描计划：

```sh
python3 "$SKILL_DIR/scripts/sync_assets.py" \
  --project "$PROJECT_ROOT" \
  --state-dir "$SYNC_DIR"
```

计划不下载完整物料，不上传 CDN，也不修改项目。
检查 changed、unchanged、deferred 和 removed 数量。
预期增量却出现全量时，先核对同步目录和来源身份。

再执行发布：

```sh
python3 "$SKILL_DIR/scripts/sync_assets.py" \
  --project "$PROJECT_ROOT" \
  --state-dir "$SYNC_DIR" \
  --browser-origin 'http://127.0.0.1:4173' \
  --apply
```

`--browser-origin` 指定需要通过 CORS 校验的页面来源。线上验收时传入对应线上来源。
默认 bucket 为 `galaceanoss`，prefix 为 `assets/`。
始终排除 `assets/gamedesign/`。
`--prefix` 可用于受限验证。不要用局部结果覆盖正式全库配置。

## 扫描与资产版本

1. 首次同步处理全量资产。
2. 后续比较每个对象的 LastModified、ETag、Size 和所属资产的文件集合。
3. 描述未变但模型或贴图变化时，仍处理所属资产。
4. 最近 60 秒内仍在变化的资产延至下一轮。
5. 上传后再次检查文件清单。源版本变化时，不发布本轮结果，并报告需要重试。

OSS 没有变更日志时，需要分页列举全部对象元数据。
列举元数据不等于下载全部物料。只下载新增或变化的资产。
同步时间用于报告。完整指纹比较用于避免时间边界、失败重试和延迟列举造成遗漏。

最近的上级 `describe.json` 定义一个资产的范围。
描述声明的资产文件和 manifest 必须存在，且位于该资产目录内。
不要猜测或补造缺失描述。

资产是版本单位。任一文件变化时，发布该版本的完整文件集。
所有文件使用同一不可变版本目录，并保留相对路径。
不要修改物料内容。未变化的其他资产不下载。
重试同一版本时，复用已校验的上传记录。

## 资源上限与清理

按资产串行处理。每个资产按文件串行处理。
使用流式传输。每个文件上传并校验后，立即删除下载临时文件。
保留 OSS 原件、本地用户原件和同步账本。

| 项目 | 上限或要求 |
|---|---|
| OSS 同步的单文件大小 | 默认 512 MiB |
| 下载磁盘预算 | 容纳当前文件后，至少剩余 64 MiB |
| 单个资产的文件数 | 最多 10,000 |
| 持久化 source 元数据总量 | 最多 64 MiB |
| 目录构建输入 | 最多 64 MiB，仅包含描述和 URL |
| Node heap | 512 MiB |

超限时失败，不自动调大预算。
失败或取消后，同样清理临时物料。
恢复崩溃任务时，只清理当前同步目录中由脚本创建的临时目录。具体目录见存储协议。

## 发布与来源保留

使用目标项目的 catalog 构建器，不维护第二套索引格式。
按以下顺序发布：

1. 资产物料。
2. 索引和摘要。内容相同时复用已有上传。
3. manifest。
4. 项目入口配置。

所有新文件必须通过 CDN 回读的 SHA-256、长度和 CORS 校验。
校验失败时，不更新项目入口，也不推进成功时间。

完整扫描发现 OSS 描述已删除时，从下一版召回目录移除对应 OSS 来源资产。
不要删除 OSS 或 CDN 文件。
`local_assets` 表标识本地直传资产。不要因为 OSS 未列举到它们而移除这些资产。
OSS 与本地来源目录冲突时，停止并报告。
当前 Retrieval 格式不支持空库。遇到空库时失败，并保留旧入口。

## 失败与重试

不更换算法绕过失败，不静默跳过坏资产，也不连续轮询。

- OSS 瞬时网络错误和可重试服务错误：最多尝试 3 次。
- SDK 请求异常，以及响应流的连接、超时或分块传输异常：适用上述重试规则。
- 读取中断：清空未完成文件，再读取整个文件。不要追加到残缺内容之后。
- 源版本变化：本轮不自动重试。
- 单文件上传：最多尝试 3 次。

修复环境或源数据后，使用相同命令和同步目录重试。
复用成功检查点。

## 交付与测试

按 [交付和可选测试规则](references/acceptance.md) 报告结果并询问用户。
另行报告来源、目标项目和分支、增量统计、延后数量、manifest URL、成功时间及失败项。
确认 `tmp` 中没有残留物料。

修改同步脚本后，运行 `python3 scripts/test_sync.py`。
该测试使用隔离目录和假的 OSS/CDN，不执行正式发布。
