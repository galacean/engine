# M0 实现与验证

M0 提供原生组件/资源、Scene/Prefab 注册、每 Scene WaterSystem 和系统 API/Agent 契约，复用既有 Lake/River/Ocean 编译与后端，不另建水系统。使用契约见 [原生入口](README.md)。本页汇总 2026-10-09 阶段记录；当前 PR 验证以 [PR #55 实施记录](../../../demos/terrain/seed-world-planner/V2_IMPLEMENTATION.md) 和远端评论为准。

## 已落实的行为与阶段 CR

以下编号属于 M0 阶段审查，不是 PR #55 的 CR-001～009：

| 阶段问题 | 修复边界 |
| --- | --- |
| M0 CR-001 | 作者登记与运行发布分开；覆盖加载顺序、禁用组件、System 启动后加入的非激活 Entity/父节点/Prefab。发现不激活实例，已登记采样/逐帧不扫场景 |
| M0 CR-002 | 配置准备期间延后 Transform 刷新，接受后使用最新配置/变换，不用旧请求取消新配置 |
| M0 CR-003 | 前置失败同步 ready/lastError 并取消旧准备；解析抛错、保留旧配置，迟到任务不覆盖错误 |
| M0 CR-004 | kind 为轻量只读元数据，采样/状态不读取完整资产快照；真实后端连续 100 次读取计数为 0，非 FPS 证据 |
| M0 CR-005 | 禁用/移除同步发布查询退出与 revision，再等退休清理；延迟/失败清理不回滚已发布状态 |

共享 ResourceManager 纹理引用按 Scene owner 释放；原生资源可序列化并保持独立修订。联合入口同步改为增量原子文件替换，Brotli 旧 304 解码头有独立 HTTP 回归；未改 water/island 的产品水域。

## 历史证据与限制

最终阶段定向回归 4 文件/43 项、架构组 11 文件/81 项、Water 类型与当时 104 项声明校验通过。原生 WebGLEngine 页面 79 项检查通过，含 Scene/Prefab、禁用恢复、资源隔离、11 条确定性 Agent 回放与 Planner 输入；SeedWorld 普通入口及联合案例启动曾复核。更早全量存在两项超时，后续定向复跑通过，不将旧全量记录视为当前基线已通过。

复现入口 `demos/water/tests/browser/native-water.html`；`?instructions=model` 必须有可用模型桥接，历史桥接失败不计模型通过。真实模型统一后置；Editor 证据仅 Scene/Prefab 加载与引用往返。每 Scene 一个活动 Ocean、datum 不含视觉 Gerstner；移动端、性能预算、美术、岸线精度和 Editor 面板未由本阶段完整验收。M2 水量/降雨/灌溉及世界过程存档未实施。
