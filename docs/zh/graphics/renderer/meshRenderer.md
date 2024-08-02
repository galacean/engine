---
order: 1
title: 网格渲染器
type: 图形
group: 渲染器
label: Graphics/Renderer
---

[MeshRenderer](/apis/core/#MeshRenderer) 是网格渲染器组件， 使用网格对象（如立方体）作为几何体轮廓的数据源。当一个实体挂载了网格渲染组件，只需设置它的 `mesh` 与 `material` 即可渲染物体。

<playground src="scene-basic.ts"></playground>

## 使用

在编辑器 **[层级面板](/docs/interface/hierarchy)** 中，你可以快速创建一个挂载了长方体网格渲染器的节点（ **层级面板** -> **右键** -> **3D Object** -> **Cuboid** ）。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Pca9RZvOsNMAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006"  />

当然，也可以为场景中已有的节点挂载上网格渲染器，并设置任意[网格](/docs/graphics-mesh)与[材质](/docs/graphics-material)。（ **选中节点** -> **[检查器面板](/docs/interface/inspector)** -> **Add Component** -> **Mesh Renderer** ）。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*UHfjTYk0b4sAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006"  />

对应在脚本中使用如下所示：

```typescript
const cubeEntity = rootEntity.createChild("cube");
const cube = cubeEntity.addComponent(MeshRenderer);
cube.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
cube.setMaterial(new BlinnPhongMaterial(engine));
```

## 属性

在编辑器中，可以很方便地设置网格渲染器的属性。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*5Y-3TrYyWo8AAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006" style="zoom:50%;" />

| 设置             | 解释                                               |
| :--------------- | :------------------------------------------------- |
| `material`       | 待渲染物体的[材质](/docs/graphics-material)信息   |
| `mesh`           | 待渲染物体的[网格](/docs/graphics-mesh)信息       |
| `receiveShadows` | 是否接收阴影                                       |
| `castShadows`    | 是否投射阴影                                       |
| `priority`       | 渲染器的渲染优先级，值越小渲染优先级越高，默认为 0 |

相比于基础的[渲染器](/docs/graphics-renderer)，网格渲染器还可设置是否支持顶点色（顶点色数据包含在网格的顶点信息中）。

| 属性                | 解释           |
| :------------------ | :------------- |
| `enableVertexColor` | 是否支持顶点色 |

```typescript
const meshRenderer = entity.getComponent(MeshRenderer);
// 启用顶点色
meshRenderer.enableVertexColor = true;
```

## 方法

网格渲染器并**没有新增**其他方法，但需要注意的是，很多情况下网格渲染器的网格内包含**若干子网格**，若希望每个子网格都对应**不同的材质**，可以在设置的时候就指定相应的**网格索引**，否则默认使用相同的材质。
