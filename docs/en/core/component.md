---
order: 4
title: Components
type: Core
label: Core
---

In the Galacean engine, [Entity](/apis/core/#Entity) does not have actual functionalities such as rendering models. These functionalities are implemented by loading [Component](/apis/core/#Component) component classes. For example, if you want to turn an _Entity_ into a camera, you just need to add the camera component [Camera](/apis/core/#Camera) to that _Entity_. This component-based functionality extension method focuses on encapsulating the program independently according to functionality, and combining and adding as needed during use, which is very beneficial for reducing program coupling and improving code reusability.

Common components:

| Name                                                  | Description    |
| :---------------------------------------------------- | :------------- |
| [Camera](/apis/core/#Camera)                       | Camera         |
| [MeshRenderer](/apis/core/#MeshRenderer)           | Static Model Renderer |
| [SkinnedMeshRenderer](/apis/core/#SkinnedMeshRenderer) | Skinned Model Renderer |
| [Animator](/apis/core/#Animator)                   | Animation Control Component |
| [DirectLight](/apis/core/#DirectLight)             | Directional Light |
| [PointLight](/apis/core/#PointLight)               | Point Light    |
| [SpotLight](/apis/core/#SpotLight)                 | Spotlight      |
| [ParticleRenderer](/apis/core/#ParticleRenderer)   | Particle System |
| [BoxCollider](/apis/core/#BoxCollider)             | Box Collider   |
| [SphereCollider](/apis/core/#SphereCollider)       | Sphere Collider |
| [PlaneCollider](/apis/core/#PlaneCollider)         | Plane Collider |
| [Script](/apis/core/#Script)                       | Script         |

## Editor Usage

After selecting an entity from the **[Hierarchy Panel](/en/docs/interface/hierarchy)** or the scene, the inspector will display all the components mounted on the currently selected node, with the component names displayed in the upper left corner

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*tZcpRrrYQcMAAAAAAAAAAAAADsJ_AQ/original" alt="Name" style="zoom:50%;" />

You can control whether it is enabled in the inspector

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*QRG8TZ1IorQAAAAAAAAAAAAADsJ_AQ/original" alt="Enable" style="zoom:50%;" />

If you don't need it, you can also delete it

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*uqFGQIHyLAwAAAAAAAAAAAAADsJ_AQ/original" alt="Delete" style="zoom:50%;" />

Or edit its various properties

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*IFnGRYHdi7gAAAAAAAAAAAAADsJ_AQ/original" alt="Edit" style="zoom:50%;" />

If it is an empty node, you can click the `Add Component` button to add new components to the current entity.

<img src="https://gw.alipayobjects.com/zos/OasisHub/95d58dde-109f-44b2-89ef-2959ad8b4fe3/image-20230926112713126.png" alt="image-20230926112713126" style="zoom:50%;" />

## Script Usage

### Adding Components

We use [addComponent(Component)](/apis/core/#Entity-addComponent) to add components, for example, adding a "Direct Light" component ([DirectLight](/apis/core/#DirectLight)) to an `Entity`:

```typescript
const lightEntity = rootEntity.createChild("light");
const directLight = lightEntity.addComponent(DirectLight);
directLight.color = new Color(0.3, 0.3, 1);
directLight.intensity = 1;
```

### Finding Components on an Entity

When we need to get a component on an entity, the [getComponent](/apis/core/#Entity-getComponent) API will help you find the target component.

```typescript
const component = newEntity.getComponent(Animator);
```

Sometimes there may be multiple components of the same type, and the above method will only return the first found component. If you need to find all components, you can use [getComponents](/apis/core/#Entity-getComponents):

```typescript
const components = [];
newEntity.getComponents(Animator, components);
```

In assets like glTF, we might not know which entity the target component is on. In this case, you can use [getComponentsIncludeChildren](/apis/core/#Entity-getComponentsIncludeChildren) to search.

```typescript
const components = [];
newEntity.getComponentsIncludeChildren(Animator, components);
```

### Getting the Entity of a Component

Continuing with the example of adding a component at the beginning. You can directly get the entity of the component:

```typescript
const entity = directLight.entity;
```

### State

When temporarily not using a component, you can actively call the component's [enabled](/apis/core/#Component-enabled)

```typescript
directLight.enabled = false;
```
