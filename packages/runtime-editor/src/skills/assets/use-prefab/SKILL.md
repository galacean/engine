---
name: assets-use-prefab
description: 放置已有 Prefab，或修改 Prefab 实例及其共享模板时使用。
---

# 使用 Prefab

Create linked Prefab instances with entity.create({scene,name,prefab:virtualPath}). component.query/read include template members and local additions, even before Apply. Use the queried ID in component.update to write native instance overrides; use component.revert to restore inheritance. entity.create accepts a linked instance or member as parentEntityId and records a local added entity. entity.update records member properties as overrides; entity.delete records removal of inherited members or deletes local additions. component.add accepts editable instance members and local additions; component.remove removes inherited or locally added components. Inherited nested Prefab edits use native Scene-owned nested overrides and leave the shared template unchanged. Local additions may move to another editable instance or to the Scene. A locally added Prefab owns its own overrides and can be edited normally. Reparenting template-owned members is not exposed, matching Editor hierarchy restrictions. Arbitrary Engine Prefab.instantiate clones are not registered editor instances.

已有 Prefab 的共享模板和放置实例分别维护。修改哪个对象取决于用户希望影响一处还是所有实例。当前未提供从节点生成 Prefab 或解除实例关联的编辑接口；不要推断存在这些能力。Script 中的运行时克隆也不会自动生成 Prefab 资产。
