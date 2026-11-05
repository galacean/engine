---
name: world-objects
description: 查询、检查、删除世界对象，或管理对象标签和选区时使用。树木、地貌、水体等由世界系统管理的对象从这里定位；Scene 节点见 scene-nodes。
---

# 对象查询与管理

## 确定对象

按下面的接口索引选择当前宿主的对象模型。

- 已知世界资产：复用完整的 `ref`，或上次创建、修改结果中的 `assetRef`。需要时用 `world.inspect` 读取当前详情。
- 未知世界资产：用 `world.query` 查找。查询结果的身份在 `item.ref` 中，含 `id`、`kind`、`domain`、`source`。
- 从截图确定的对象：用 `pick` 返回的引用读取当前运行时身份和作者映射，再按返回的归属信息选择编辑接口。
- 规划组件：见[规划参数](skills/world-objects/parameters/SKILL.md)。
- 由系统管理的对象：按对应系统的 Skill 查找查询和编辑接口。

使用 schema 给出的范围，以及返回的 kind、ID 和组件。运行时 ID 和规划实体 ID 都不是世界 Asset Ref。

## 查询

按组件或 kind 缩小查询范围。需要更多结果时，按 `nextOffset` 继续。只返回下一步决策需要的字段。类型专属字段从声明读取。只有接口索引列出标签和命名选区接口时，才使用它们。

## 删除与撤销

删除遵循各能力的契约。撤销和重做见 [history](skills/history/SKILL.md)。

## 归属与包含

归属和空间包含是两种关系。父引用表示所有者。`relatedTo.relation: "inside"` 检查几何包含。复用返回的引用。

## 接口索引

<!-- API_INDEX: generated from executable contracts at load time. -->

世界对象的类型字段见[资产类型](skills/world-objects/references/asset-types.md)。
