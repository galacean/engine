---
name: runtime
description: 检查实时运行中实体和组件的只读状态（如 pick 命中实体或读取运行期组件属性）时使用。
---

# 运行时检查

`tools.runtime.*` 只读检查当前运行中的 Engine 实体、子节点和组件字段，使用运行时数字 `entityId` / `componentId`（通常来自 `pick` 命中结果）。

- 它们不修改项目文件，也不替代 `editor.*`（编辑 Scene 节点见 [scene-nodes](skills/scene-nodes/SKILL.md) 与 [components](skills/components/SKILL.md)）。
- 不要把规划实体 ID 或 Scene Source ID 传给 `tools.runtime.*`。
- **按运行时 ID 查询组件**：已有 `entityId` 时，用 `tools.runtime.component.query({ entityId, type })` 找到组件，再用 `tools.runtime.component.read({ componentId, fields })` 读所需字段。缺少 `entityId` 时，用 `tools.runtime.entity.children` 分页，从场景根节点或已知父节点开始。按 `nextOffset` 继续同一列表，按返回的子节点关系缩小范围，找到目标后结束搜索。小范围查询可在一次 `execute` 中完成。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->
