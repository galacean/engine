# Runtime 虚拟项目实施记录

## 目标与完成门槛

将现有原生编辑、世界编辑、运行时开发的 Knowledge / Declare 汇入同一虚拟项目；项目包括 knowledge/、declare/、assets/、project.json、execute.js。游戏初始化恢复 storage 中的项目与 Scene，资产编辑与组件编辑更新同一项目数据。实际 LLM 完成“在我面前添加一个旋转立方体”，等待保存后结束页面会话并重新进入，验证立方体、脚本绑定和旋转行为恢复。单测、模拟模型和刷新内存对象不能替代该验收。

## 2026-10-08 当前源码审计

工作目录：engine-next-llm-optimization，分支 codex/llm-optimization。主 checkout 存在其他世界系统改动，本任务不覆盖它们。

### 可复用内容

- 世界编辑：seed-world-planner/agent-adapter/knowledge、contracts 与 generated 声明；SeedWorldKnowledge.ts 当前将它们组装为静态目录。
- 原生编辑：Editor origin/dev/2.0 的 packages/editor-api/src/tools/component、资产工具及 model Facade；需要适配宿主能力，不可将 Editor 的类型直接当作 runtime 已实现接口。
- 运行时开发：匹配当前引擎版本的 Script / Transform 等源码、示例与构建声明；还需确认可分发声明入口与世界运行时的公开类型。
- 项目映射：Editor origin/dev/2.0 packages/storage 的 createSyncProject/readSyncProject/saveSyncProject、FileSystem 与内存实现可作参考。现有 Editor 源项目 project.galacean 和 .galacean/manifest.json 与发布 project.json 不应混用。
- 持久化：oasisbe 目标 sprint 分支保存项目元信息、资产记录和文件 URL；单资产更新不证明整个 runtime 项目保存原子性。

### 当前缺口（未完成）

- agent-loop.ts 仍按 loadedModules 筛选执行 API 及 checker 声明，readKnowledgeFiles 仍递归拼接声明依赖。文件读取与能力开放没有解耦。
- 未发现本工作树已集成统一 runtime 项目、原生组件/资产编辑和脚本资产保存恢复链路的证据。
- 原生引擎声明不能直接赋予 execute 主线程对象访问；execute 编辑代理与运行脚本的检查环境需区分。
- 未执行旋转立方体的真实 LLM、保存、离线重进验收。

## 实施顺序

1. 建立统一只读项目文件视图：路径查询、内容读取、声明依赖解析共用来源。知识读取只返回请求文件；执行权限由注册能力决定，checker 使用完整对应环境。
2. 挂载已有三类知识声明，保持来源和版本可追溯。生成能力目录与路径链接，验证同一版本下的示例和声明。
3. 建立 runtime 项目数据及 storage 适配：project.json 映射全部 Scene 和资产，初始化恢复目录，内容可按需加载；资产身份稳定，Scene 组件修改与文件读取一致。
4. 实现脚本资产、原生实体/组件/材质编辑及脚本执行加载，连接已有 execute 草稿与 Worker。查询返回宿主快照，写操作进入事务。
5. 保存并从新页面会话重建；运行真实 LLM 指令，验证相对玩家位置、实体/材质/脚本、持续旋转及重进恢复，记录实际存储证据。

状态：进行中。此记录不是功能已实现或验收已通过的声明。
