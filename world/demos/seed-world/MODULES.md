# Seed World 编辑与系统边界

本版本使用预置系统。系统召回、包安装、动态系统宿主、LLM 从零生成系统不在当前实现中；普通资产和文件夹导入仍然可用。

| 模块 | 目录或入口 | 负责什么 |
| --- | --- | --- |
| 虚拟文件系统 | `shared/project-files/` | 路径、目录、挂载、只读来源、元信息、读取与列举 |
| 工程与资产 | `shared/runtime-editor/project/` | 资产导入、内容、直接依赖及反向索引、删除保护、事务、保存与撤销 |
| 场景编辑 | `shared/runtime-editor/scene/` | Entity/Component 作者数据、层级、真实场景投影 |
| Script 运行环境 | `shared/runtime-editor/scripts/` | 编译 Worker、模块加载、宿主声明、`assetUrl`、静态引用分析 |
| Agent 执行 | `shared/ai-chat/` | 模型循环、read/list/execute、执行 Worker、取消、预算和回执 |
| 通用 Editor 适配 | `shared/runtime-editor-agent/` | 将 Editor API、声明和知识暴露给 Agent |
| Seed World 装配 | `SeedWorldProject.ts`、`SeedWorldProjectFormats.ts`、`systems/` | 启动工程，注册预置系统、资产格式和 Script 模块 |
| 世界 Agent 适配 | `agent-adapter/` | 世界 API 契约，以及世界事务与通用 Editor 事务的组合 |
| 具体系统 | `masonry/`、`spatial/farming/`、`shared/farming/` | 领域状态、规则、操作、资产格式及各自的编辑接口 |
| LLM 验收 | `tests/llm/`、仓库 `.agents/skills/test-system-llm/` | 玩家指令、夹具、成功标准、串行执行、Trace、基线和报告 |

表中的 `shared/` 与 `tests/` 相对 Gallery 根目录。新增能力应放到其状态和规则的所有者中。VFS 不安装系统，通用 Editor 不依赖 Agent 或 Demo，系统业务规则不进入通用 Agent Prompt。生成的声明放在所属模块的 `generated/`，由对应生成器维护。

资产格式表由工程装配层持有，启动、依赖维护和 Agent 编辑消费同一份注册。组件运行状态由系统自行管理；需要持久化的内容通过 Runtime Editor 的资产发布流程提交，直接依赖和内容一起保存。查询句柄保留在会话内存；显式保存的选择、标签和编辑配置写入当前版本的编辑文档。

当前保存格式不兼容旧工程。没有包能力开关、旧接口转发或旧编辑文档迁移路径。历史实施记录只用于追溯，不代表当前产品入口。
