---
name: assets-use-model
description: 把已导入的 GLB 模型放到场景或由 Script 加载时使用。
---

# 使用 GLB 模型

GLTF 资产不是 Prefab。当前可通过组件配置或 JSON 声明模型引用，由 Script 加载 GLTFResource 并 instantiateSceneRoot；资源引用和按需加载方式见[配置资产](skills/scripting/references/configured-assets.md)。这种运行时实例不是可通过 editor.entity 编辑的作者层级。

Script 资产中调用 Engine 方法；execute 代码中调用 Editor 声明的方法。不要在 execute 中直接使用 GLTFResource 实例或照搬 Editor 的 gltf.create、instantiate、unpack 等未提供的方法。

## 保留模型结构

完整模型包含网格、材质、节点变换和可能的动画。单独选一个网格子资源只得到几何，不包含完整节点层级。整体摆放优先保留模型根节点及其子层级；需要独立几何时检查所需变换，不猜测子资源索引。

模型外形可能偏离根节点原点。结合包围盒、父子变换、缩放和朝向摆放；多个模型根节点位置相同不意味着外形已经对齐。修改材质前检查实际引用，判断应该改共享材质还是当前实例绑定，避免意外影响其他对象。
