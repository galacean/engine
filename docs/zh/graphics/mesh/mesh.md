---
order: 0
title: 网格总览
type: 图形
group: 网格
label: Graphics/Mesh
---

网格是[网格渲染器](/docs/graphics-renderer-meshRenderer)的数据对象，它描述了顶点的各种信息（位置，拓扑，顶点色，UV 等）。

## 网格资产

网格资产一般来源于：

- 通过[导入模型](/docs/graphics-model-importGlTF)，获取第三方工具创建的[模型内置网格资产](/docs/graphics-model-assets)
- 编辑器的[内置网格资产](/docs/graphics-mesh-primitiveMesh)
- 开发者自身[创建网格资产](/docs/graphics-mesh-primitiveMesh)

## 使用

当需要为网格渲染器设置网格时，只需要选择对应的网格资产即可。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*fmhoSrmQQ78AAAAAAAAAAAAADhuCAQ/original" alt="import" style="zoom:100%;" />

相应的，在脚本中，网格的使用会更加自由，同时复杂度也会高一些，首先我们看下

| 类型                                             | 描述                                                                                                                                                 |
| :----------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ModelMesh](/docs/graphics-mesh-modelMesh)      | 封装了常用的设置顶点数据和索引数据的方法，非常简单易用。开发者若想要快速地去自定义几何体可以使用该类                                                 |
| [BufferMesh](/docs/graphics-mesh-bufferMesh)    | 可以自由操作顶点缓冲和索引缓冲数据，以及一些与几何体绘制相关的指令。具备高效、灵活、简洁等特点。开发者如果想高效灵活的实现自定义几何体就可以使用该类 |
| [内置几何体](/docs/graphics-mesh-primitiveMesh) | 本质上是预置的 ModelMesh , 包含常用的长方体，球体，平面，圆柱，圆环，圆柱与胶囊体。                                                                  |

## 使用

在编辑器中，网格以网格资产的形式出现，我们可以通过

```typescript
const meshRenderer = entity.addComponent(MeshRenderer);
meshRenderer.mesh = new ModelMesh(engine);
// or
meshRenderer.mesh = new BufferMesh(engine);
```

## 常用几何体

自己构造几何体网格数据是一个比较痛苦的过程，因此 Galacean 内置了一些较为实用的几何体。

- [内置几何体](/docs/graphics-model)：包含常用的长方体，球体，平面，圆柱，圆环，圆柱与胶囊体。
