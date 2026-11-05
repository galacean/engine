---
name: world-objects-parameters
description: 查询或修改规划组件参数（world.parameters）时使用，如区域植被、天气、光照和动物种群。
---

# 规划参数

`world.parameters.describe` 可用时，当前场景使用组件编辑方式。流程如下：

1. 从公开元数据中找到相关组件。
2. 目标未知时，查询符合条件的实体。
3. 用 inspect 读取目标的有效值和 `versionToken`。
4. 用这个 token 提交一次原子的 `world.parameters.apply`。

`set`、`reset`、`base` 与 Inspector 使用的操作相同。范围、单位、字段规则和材质部位语义来自组件元数据。不要编造字段名。

## 分页

参数读取按 Agent 结果预算分页。

- `componentTypes` 列出完整的组件索引，`components` 只含当前页字段。
- 用 `component` 和 `search` 缩小 describe 的范围，用 `component` 和确切的 `fields` 缩小 inspect 的范围。
- 需要更多字段或实体时，按 `nextOffset` 继续，过滤条件不变。
- `matchedCount` 在 describe 和 inspect 中是匹配字段总数，在 query 中是实体总数。
- 某一页没有某字段，不能证明它未设置。
- execute 脚本只返回相关摘要。

## 与单体植被的关系

用接口索引判断 `vegetation.create/update` 是否开放。开放时，它们独立于规划组件，用于创建和编辑作者植被，允许的操作以其契约为准。

## 回执

参数回执 accepted 表示已等待发布和持久化完成，不代表视觉验收。发生冲突后，重新 inspect。Scene v2 只保存作者组件，定义通过 ResourceManager 加载为 JSON 资产。生成的几何在加载后重建。

`apply` 返回诊断计数和 `receiptId`。下一次编辑前，通过 `world.parameters.receipt` 读取详细检查项或变更 ID，需要时分页。事务 accepted 时，规划检查仍可能失败或未知。声称满足用户意图前，先检查诊断摘要。不要为了取回执而重复编辑。
