---
name: components
description: 给节点添加或移除组件、读取或修改组件属性、调用组件方法时使用。系统组件有专门的 Skill 时优先使用对应 Skill。
---

# 组件

All native editing uses editor.asset, editor.entity and editor.component; ordinary documents use external file tools. The application tools namespace is separate.

## 查询

editor.component.query({scene, entityId?, id?, type?}) queries the current authoring draft, including earlier edits in this execute. editor.component.read returns authored properties. Querying a registered literal type also provides its typed live methods; editor.component.query({type}) without scene queries the active runtime. New components must be committed and activated before calling live methods. After removal, the same Scene-scoped query no longer returns that component. Names are discovery labels; scene/entityId/id/type identify a component. A typed system proxy resolves that identity again for every live call; never use an Engine instanceId or assume a deleted component still exists.

## 修改

Component properties use the Editor source schema: { $ref: virtualPath } for assets, { $entity: entityId } and { $component: componentId } for hierarchy references.

For a MeshRenderer, mesh references a mesh asset; material references a material asset and is compiled to setMaterial. To edit a Light, use its actual Engine declaration for property names, then component.update with the component ID and changed properties.

Moving a component, removing serialized properties or editing explicit setter calls recreates that component to restore loader defaults. Component construction temporarily deactivates its owner Entity; activation resumes after properties and references are bound. After a partial projection failure, the next native edit or undo resynchronizes authored components and resets their transient state.

## 相关

- 编辑如何生效：[草稿与提交](skills/scene-nodes/references/draft-and-commit.md)
- Prefab 实例上的覆盖：[使用 Prefab](skills/assets/use-prefab/SKILL.md)
- 接口：[原生编辑 API](declare/editor/native/api.d.ts)、[Scene/Prefab 数据](declare/editor/native/source.d.ts)、[Engine 声明](skills/scripting/references/runtime-modules.md)
