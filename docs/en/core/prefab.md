---
order: 10
title: Prefab
type: Core Concept
label: Core
---

## Introduction

A prefab is an asset that can be seen as a template storing **[entity](/en/docs/core/entity)** data (including its child entities and components). Prefabs allow developers to create and update this template, then instantiate it into the scene as needed.

If you want to reuse an entity configured in a specific way in multiple locations within a scene or across multiple scenes in a project, such as non-player characters (NPCs), props, or scenery, you should convert this game object into a prefab. This approach is better than simply copying and pasting game objects because prefabs can keep all copies synchronized.

### Main features of prefabs:

#### Reusability:
The same prefab can be used in multiple scenes, and any modifications to the prefab can be automatically applied to all instances.

#### Easy management:
Prefabs can package complex entities (including their child entities and components) into a single asset, making them easier to manage and organize.

#### Consistency:
By using prefabs, you can ensure that objects used in different scenes or parts remain consistent.

#### Increased efficiency:
Extensive use of prefabs can reduce repetitive work, making the development process more efficient.

## Editor Usage

### Creating a Prefab

There are two ways to create a prefab

1. Right-click the entity to create a prefab using this entity as a template
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*1D-6TpXqDWcAAAAAAAAAAAAADsJ_AQ/original)
2. Drag the entity from the **[Hierarchy Panel](/en/docs/interface/hierarchy)** to the **[Assets Panel](/en/docs/assets/interface)** to create a prefab using this entity as a template
![create](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*IXI9Q4ljEu8AAAAAAAAAAAAADsJ_AQ/original)

### Updating a Prefab

There are two ways to update a prefab

#### Global Replacement

Drag the entity from the **Hierarchy Panel** to the existing prefab asset in the **Assets Panel**, and the prefab asset will be updated with the new content. All instances generated from this prefab will also be updated with the latest content.
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*o0WAR77vPbIAAAAAAAAAAAAADsJ_AQ/original)

The entity can also be an instance of this prefab
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*A0TpTZs7i3EAAAAAAAAAAAAADsJ_AQ/original)

#### Apply Instance Modifications

Instances of a prefab are generated based on the prefab template, and all instances will change with the template. However, each instance may have its own modifications: adding, deleting, or updating child entities and their components. To make the instance's modifications part of the template, you can do the following:

1. Add child nodes
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*mnm8SIA8MXIAAAAAAAAAAAAADsJ_AQ/original)

2. Delete child nodes
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*AN5YQpYSoNsAAAAAAAAAAAAADsJ_AQ/original)

3. Modify child nodes
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*CoZKT4O9mzMAAAAAAAAAAAAADsJ_AQ/original)

4. Add components
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*XFz3TrsJjBoAAAAAAAAAAAAADsJ_AQ/original)

5. Update components
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*mM2dS70ZR7cAAAAAAAAAAAAADsJ_AQ/original)

6. Delete components
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*WC8ZTIv5MK4AAAAAAAAAAAAADsJ_AQ/original)

### Unpack Prefab Instance

If you want a prefab instance to disconnect from the prefab so that it does not change with the prefab, you can unpack the prefab instance
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*vtpERpaqb_AAAAAAAAAAAAAADsJ_AQ/original)

### Delete Prefab

A prefab is an asset, and the deletion method is the same as other assets. It is worth noting that after deleting the prefab, there are two ways to handle the prefab instances:

1. All prefab instances are deleted
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*EJEGSZMi7ZAAAAAAAAAAAAAADsJ_AQ/original)
2. All prefab instances are unpacked
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*54i3QYBUsaQAAAAAAAAAAAAADsJ_AQ/original)


## Script Usage

### Load Prefab
The engine object for the prefab asset is [PrefabResource](/en/apis/loader/#PrefabResource}).
After loading (see [Asset Loading](/en/docs/assets/load)), you can instantiate the prefab using the [instantiate](/en/apis/loader/#PrefabResource-instantiate}) method.

```typescript
engine.resourceManager
  .load({ url: "Prefab's URL", type: AssetType.Prefab })
  .then((prefab: PrefabResource) => {
    const prefabInstanceEntity = prefab.instantiate();
    scene.addRootEntity(prefabInstanceEntity);
  });

```
