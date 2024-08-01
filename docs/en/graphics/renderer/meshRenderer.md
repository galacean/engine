---
order: 1
title: Grid Renderer
type: Graphics
group: Renderer
label: Graphics/Renderer
---

[MeshRenderer](/apis/core/#MeshRenderer) is a grid rendering component. When an entity is equipped with a mesh rendering component, you only need to set its `mesh` and `material` to render the object.

<playground src="scene-basic.ts"></playground>

## Usage

In the editor **[Hierarchy Panel](/en/docs/interface/hierarchy)**, you can quickly create a node with a cuboid mesh renderer attached ( **Hierarchy Panel** -> **Right-click** -> **3D Object** -> **Cuboid** ).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Pca9RZvOsNMAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006"  />

Alternatively, you can attach a mesh renderer to existing nodes in the scene and set any [mesh](/en/docs/graphics-mesh) and [material](/en/docs/graphics-material). ( **Select Node** -> **[Inspector Panel](/en/docs/interface/inspector)** -> **Add Component** -> **Mesh Renderer** ).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*UHfjTYk0b4sAAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006"  />

Corresponding script usage is as follows:

```typescript
const cubeEntity = rootEntity.createChild("cube");
const cube = cubeEntity.addComponent(MeshRenderer);
cube.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
cube.setMaterial(new BlinnPhongMaterial(engine));
```

## Properties

In the editor, you can easily set the properties of the mesh renderer.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*5Y-3TrYyWo8AAAAAAAAAAAAADhuCAQ/original" alt="image-20231007153753006" style="zoom:50%;" />

| Setting          | Explanation                                           |
| :--------------- | :----------------------------------------------------- |
| `material`       | Information about the [material](/en/docs/graphics-material) of the object to be rendered |
| `mesh`           | Information about the [mesh](/en/docs/graphics-mesh) of the object to be rendered     |
| `receiveShadows` | Whether to receive shadows                             |
| `castShadows`    | Whether to cast shadows                                |
| `priority`       | Rendering priority of the renderer, the smaller the value, the higher the priority, default is 0 |

Compared to the basic [renderer](/en/docs/graphics-renderer), the mesh renderer can also be set to support vertex colors (vertex color data is included in the vertex information of the mesh).

| Property           | Explanation       |
| :----------------- | :----------------- |
| `enableVertexColor` | Whether to support vertex colors |

```typescript
const meshRenderer = entity.getComponent(MeshRenderer);
// Enable vertex colors
meshRenderer.enableVertexColor = true;
```

## Methods

The mesh renderer **does not introduce** any additional methods. However, it is important to note that in many cases, the mesh renderer's mesh contains **several sub-meshes**. If you want each sub-mesh to correspond to **different materials**, you can specify the corresponding **mesh index** during setup, otherwise, the same material will be used by default.

