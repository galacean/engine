---
name: components
description: 给节点添加或移除组件、读取或修改组件属性、调用组件方法时使用。系统组件有专门的 Skill 时优先使用对应 Skill。
---

# 组件

原生编辑都通过 `editor.asset`、`editor.entity` 和 `editor.component`。普通文档使用外部文件工具。应用的 `tools` 命名空间是独立的。

## 查询

- `editor.component.query({scene, entityId?, id?, type?})` 查询当前作者草稿，包括本次 execute 之前的编辑。
- `editor.component.read` 返回作者属性。
- 查询已注册的字面量类型时，还会提供带类型的实时方法。
- `editor.component.query({type})` 不传 scene 时查询当前运行时。
- 新组件要提交并激活后，才能调用实时方法。
- 组件移除后，同一 Scene 范围的查询不再返回它。

名称只用于发现。组件身份由 scene、entityId、id、type 确定。带类型的系统代理每次实时调用都会重新解析身份。不要使用 Engine 的 instanceId，也不要假设已删除的组件仍然存在。

## 修改

组件属性使用 Editor 源数据结构：资产写 `{ $ref: virtualPath }`，层级引用写 `{ $entity: entityId }` 和 `{ $component: componentId }`。

MeshRenderer 的 mesh 引用网格资产，material 引用材质资产，并编译为 setMaterial。修改 Light 时，按它实际的 Engine 声明确定属性名，再用组件 ID 和变更的属性调用 `component.update`。

以下操作会重建组件以恢复加载器默认值：移动组件、移除已序列化的属性、编辑显式 setter 调用。构建组件时，所属 Entity 会暂时停用，属性和引用绑定后再恢复。投影部分失败后，下一次原生编辑或撤销会重新同步作者组件，并重置它们的瞬时状态。

## 相关

- 编辑如何生效：[草稿与提交](skills/scene-nodes/references/draft-and-commit.md)
- Prefab 实例上的覆盖：[使用 Prefab](skills/assets/use-prefab/SKILL.md)
- 接口：[原生编辑 API](declare/editor/native/api.d.ts)、[Scene/Prefab 数据](declare/editor/native/source.d.ts)、[Engine 声明](skills/scripting/references/runtime-modules.md)
