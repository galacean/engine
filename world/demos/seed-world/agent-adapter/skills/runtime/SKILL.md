---
name: runtime
description: 检查实时运行中实体和组件的只读状态（如 pick 命中实体或读取运行期组件属性）时使用。
---

# 运行时检查

`tools.runtime.*` 只读检查当前运行中的 Engine 实体、子节点和组件字段，使用运行时数字 `entityId` / `componentId`（通常来自 `pick` 命中结果）。

- 它们不修改项目文件，也不替代 `editor.*`（编辑 Scene 节点见 [scene-nodes](skills/scene-nodes/SKILL.md) 与 [components](skills/components/SKILL.md)）。
- 不要把规划实体 ID 或 Scene Source ID 传给 `tools.runtime.*`。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->
