---
order: 4
title: 组件
type: 核心
label: Core
---

在 Galacean 引擎中，[Entity](/apis/core/#Entity) 不具备渲染模型等实际的功能，这些功能是通过加载 [Component](/apis/core/#Component) 组件类来实现的。例如，如果想让一个 _Entity_ 变成一个相机，只需要在该 _Entity_ 上添加相机组件 [Camera](/apis/core/#Camera)。这种基于组件的功能扩展方式注重将程序按照功能独立封装，在使用的时候按照需要组合添加，非常有利于降低程序耦合度并提升代码复用率。

常用组件：

| 名称                                                  | 描述           |
| :---------------------------------------------------- | :------------- |
| [Camera](/apis/core/#Camera)                           | 相机           |
| [MeshRenderer](/apis/core/#MeshRenderer)               | 静态模型渲染器 |
| [SkinnedMeshRenderer](/apis/core/#SkinnedMeshRenderer) | 骨骼模型渲染器 |
| [Animator](/apis/core/#Animator)                       | 动画控制组件   |
| [DirectLight](/apis/core/#DirectLight)                 | 方向光         |
| [PointLight](/apis/core/#PointLight)                   | 点光源         |
| [SpotLight](/apis/core/#SpotLight)                     | 聚光灯         |
| [ParticleRenderer](/apis/core/#ParticleRenderer)       | 粒子系统       |
| [BoxCollider](/apis/core/#BoxCollider)                 | 盒碰撞体       |
| [SphereCollider](/apis/core/#SphereCollider)           | 球碰撞体       |
| [PlaneCollider](/apis/core/#PlaneCollider)             | 平面碰撞体     |
| [Script](/apis/core/#Script)                           | 脚本           |

## 编辑器使用

从 **[层级面板](/docs/interface/hierarchy)** 或场景中选择一个实体后，检查器将显示出当前选中节点挂载的所有组件，组件名显示在左上角

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*tZcpRrrYQcMAAAAAAAAAAAAADsJ_AQ/original" alt="Name" style="zoom:50%;" />

你可以在检查器中控制它是否 enabled

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*QRG8TZ1IorQAAAAAAAAAAAAADsJ_AQ/original" alt="Enable" style="zoom:50%;" />

如果不需要它也可以将它删除

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*uqFGQIHyLAwAAAAAAAAAAAAADsJ_AQ/original" alt="Delete" style="zoom:50%;" />

或者编辑它的各种属性

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*IFnGRYHdi7gAAAAAAAAAAAAADsJ_AQ/original" alt="Edit" style="zoom:50%;" />

如果是个空节点，你可以点击 `Add Component` 按钮来为当前实体添加新的组件。

<img src="https://gw.alipayobjects.com/zos/OasisHub/95d58dde-109f-44b2-89ef-2959ad8b4fe3/image-20230926112713126.png" alt="image-20230926112713126" style="zoom:50%;" />

## 脚本使用

### 添加组件

我们使用 [addComponent(Component)](/apis/core/#Entity-addComponent) 添加组件，例如给 `Entity`  添加“平行光”组件（[DirectLight](/apis/core/#DirectLight)）：

```typescript
const lightEntity = rootEntity.createChild("light");
const directLight = lightEntity.addComponent(DirectLight);
directLight.color = new Color(0.3, 0.3, 1);
directLight.intensity = 1;
```

### 查找实体上的组件

当我们需要获取某一实体上的组件， [getComponent](/apis/core/#Entity-getComponent) 这个 API 会帮你查找目标组件。

```typescript
const component = newEntity.getComponent(Animator);
```

有些时候可能会有多个同一类型的组件，而上面的方法只会返回第一个找到的组件。如果需要找到所有组件可以用 [getComponents](/apis/core/#Entity-getComponents)：

```typescript
const components = [];
newEntity.getComponents(Animator, components);
```

在 glTF 这种资产得到的实体里，我们可能不知道目标组件位于哪个实体，这时可以使用[getComponentsIncludeChildren](/apis/core/#Entity-getComponentsIncludeChildren)进行查找。

```typescript
const components = [];
newEntity.getComponentsIncludeChildren(Animator, components);
```

### 获得组件所在的实体

继续开头添加组件的例子。可以直接获得组件所在的实体：

```typescript
const entity = directLight.entity;
```

### 状态

暂时不使用某组件时，可以主动调用组件的 [enabled](/apis/core/#Component-enabled)

```typescript
directLight.enabled = false;
```
