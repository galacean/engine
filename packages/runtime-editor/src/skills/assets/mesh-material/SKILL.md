---
name: assets-mesh-material
description: 创建基础几何体，或用网格和材质资产显示物体时使用。
---

# 网格与材质

在节点上配置 MeshRenderer。mesh 和 material 使用已导入资产的 `{$ref: virtualPath}`。

PrimitiveMesh 和 Material 资产沿用 Engine 加载器的 JSON 格式。Engine 中 `PrimitiveMesh` 的方法签名描述运行时创建网格，不是这份资产 JSON。

- 基础几何体的字段：[PrimitiveMesh 格式](skills/assets/references/primitive-mesh.md)
- 材质的字段：[材质格式](skills/assets/references/material-format.md)
