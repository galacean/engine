---
name: assets-use-prefab
description: 放置已有 Prefab，或修改 Prefab 实例及其共享模板时使用。
---

# 使用 Prefab

用 `entity.create({scene,name,prefab:virtualPath})` 创建关联的 Prefab 实例。

| 操作 | 效果 |
| --- | --- |
| `component.query` / `component.read` | 包含模板成员和本地新增内容，Apply 之前也包含 |
| `component.update` | 用查询到的 ID 写入实例覆盖 |
| `component.revert` | 恢复继承 |
| `entity.create` | 可以用关联实例或成员作 parentEntityId，记录为本地新增实体 |
| `entity.update` | 把成员属性记录为覆盖 |
| `entity.delete` | 记录移除继承成员，或删除本地新增内容 |
| `component.add` | 可以加到可编辑的实例成员和本地新增内容上 |
| `component.remove` | 移除继承的或本地新增的组件 |

- 编辑继承的嵌套 Prefab 时，使用 Scene 持有的嵌套覆盖，共享模板不变。
- 本地新增内容可以移到另一个可编辑实例，或移到 Scene。
- 本地新增的 Prefab 持有自己的覆盖，可以正常编辑。
- 没有开放调整模板成员的父子关系，这和 Editor 的层级限制一致。
- 任意 Engine `Prefab.instantiate` 克隆都不是已注册的 Editor 实例。

共享模板和放置实例分开维护。改哪个对象，取决于用户希望影响一处还是所有实例。

当前没有从节点生成 Prefab 或解除实例关联的编辑接口，不要推断存在这些能力。Script 中的运行时克隆也不会自动生成 Prefab 资产。
