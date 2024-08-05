---
order: 3
title: 原始网格
type: 图形
group: 网格
label: 图形/网格
---

常用几何体统一在 [PrimitiveMesh](/apis/core/#PrimitiveMesh) 中提供。

## 编辑器使用

编辑器已经内置了`立方体`、`球`、`圆柱体` 等基础几何体，可以直接在左侧节点树点击 `+` 置入模型：

<img src="https://gw.alipayobjects.com/zos/OasisHub/331ff39f-54a4-4e8b-912b-e6a0cac38d71/image-20231009111916680.png" alt="image-20231009111916680" style="zoom:50%;" />

当然，我们也可以在组件面板点击 `1` 添加 `Mesh Renderer`组件，点击 `2` 绑定想要的基础几何体：

<img src="https://gw.alipayobjects.com/zos/OasisHub/b61f5f8c-1eba-4ea8-a019-f823a6c0b17d/image-20231009112014068.png" alt="image-20231009112014068" style="zoom:50%;" />

内置几何体无法满足需求？您可以在 **[资产面板](/en/docs/assets/interface)** 中 **右键** → **Create** → **PrimitiveMesh** 创建一个 `Mesh` 资产，并通过调整 `Mesh` 的各项参数来满足需求。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*g3XwRrrVv8kAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009111916680" style="zoom:50%;" />

## 脚本使用

<playground src="primitive-mesh.ts"></playground>

目前提供的几何体如下：

- [createCuboid](/apis/core/#PrimitiveMesh-createCuboid) **立方体**

```typescript
const entity = rootEntity.createChild("cuboid");
entity.transform.setPosition(0, 1, 0);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createCuboid(engine);
// Create material
const material = new BlinnPhongMaterial(engine);
material.emissiveColor.set(1, 1, 1, 1);
renderer.setMaterial(material);
```

- [createSphere](/apis/core/#PrimitiveMesh-createSphere) **球体**

```typescript
const entity = rootEntity.createChild("sphere");
entity.transform.setPosition(0, 1, 0);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createSphere(engine);
// Create material
const material = new BlinnPhongMaterial(engine);
material.emissiveColor.set(1, 1, 1, 1);
renderer.setMaterial(material);
```

- [createPlane](/apis/core/#PrimitiveMesh-createPlane) **平面**

```typescript
const entity = rootEntity.createChild("plane");
entity.transform.setPosition(0, 1, 0);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createPlane(engine);
// Create material
const material = new BlinnPhongMaterial(engine);
material.emissiveColor.set(1, 1, 1, 1);
renderer.setMaterial(material);
```

- [createCylinder](/apis/core/#PrimitiveMesh-createCylinder) **圆柱**

```typescript
const entity = rootEntity.createChild("cylinder");
entity.transform.setPosition(0, 1, 0);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createCylinder(engine);
// Create material
const material = new BlinnPhongMaterial(engine);
material.emissiveColor.set(1, 1, 1, 1);
renderer.setMaterial(material);
```

- [createTorus](/apis/core/#PrimitiveMesh-createTorus) **圆环**

```typescript
const entity = rootEntity.createChild("torus");
entity.transform.setPosition(0, 1, 0);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createTorus(engine);
// Create material
const material = new BlinnPhongMaterial(engine);
material.emissiveColor.set(1, 1, 1, 1);
renderer.setMaterial(material);
```

- [createCone](/apis/core/#PrimitiveMesh-createCone) **圆锥**

```typescript
const entity = rootEntity.createChild("cone");
entity.transform.setPosition(0, 1, 0);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createCone(engine);
// Create material
const material = new BlinnPhongMaterial(engine);
material.emissiveColor.set(1, 1, 1, 1);
renderer.setMaterial(material);
```

- [createCapsule](/apis/core/#PrimitiveMesh-createCapsule) **胶囊体**

```typescript
const entity = rootEntity.createChild("capsule");
entity.transform.setPosition(0, 1, 0);
const renderer = entity.addComponent(MeshRenderer);
renderer.mesh = PrimitiveMesh.createCapsule(engine);
// Create material
const material = new BlinnPhongMaterial(engine);
material.emissiveColor.set(1, 1, 1, 1);
renderer.setMaterial(material);
```
