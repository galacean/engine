---
order: 3
title: Entities
type: Core
label: Core
---

## Editor Usage

The **[Hierarchy Panel](/en/docs/interface/hierarchy)** is located on the far left of the editor, displaying all nodes in the current scene in a tree structure. Scene nodes are parent nodes of all other nodes, including cameras, lights, grids, and more. There is a search box above the node panel for fuzzy searching nodes in the scene to quickly locate them. Through the node panel, you can add or delete nodes and organize them better by sorting through drag-and-drop.

<img src="https://gw.alipayobjects.com/zos/OasisHub/e85a8a9b-decd-4a80-a7b2-9eccaeed1e2c/image-20230925173904478.png" alt="image-20230925173904478" style="zoom:50%;" />

### Adding Nodes

To add a node, you can click the add button on the node panel or right-click on a node and select "Add Child Node." After adding, you can edit the properties of the new node in the **[Inspector Panel](/en/docs/interface/inspector)**. If you use the add node button, you can also quickly create basic models like cubes/spheres.

### Editing Nodes

Click on a node to edit it. In the **[Inspector Panel](/en/docs/interface/inspector)** on the right, you can edit its name.

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*qBiVT6YtvkQAAAAAAAAAAAAADsJ_AQ/original" alt="Name" style="zoom:50%;" />

Is Active

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*1l5_QqTgZYUAAAAAAAAAAAAADsJ_AQ/original" alt="IsActive" style="zoom:50%;" />

Transform

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*3JO6S7BdgMsAAAAAAAAAAAAADsJ_AQ/original" alt="Transform" style="zoom:50%;" />

And adding/removing components for it

<img src="https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*iZKVRrznLOAAAAAAAAAAAAAADsJ_AQ/original" alt="AddComponent" style="zoom:50%;" />

### Deleting Nodes

After selecting a node, you can click the delete button on the node panel or use the delete option in the right-click menu to remove the node. Deleting a node will also delete all its child nodes. Therefore, when deleting a node, you need to consider if it will affect other nodes in the scene.

### Node Sorting

To better organize nodes, you can sort them by dragging and dropping. After selecting a node, you can change its position in the hierarchy tree by dragging with the left mouse button. glTF model nodes cannot adjust the scale property, so usually, you need to drag the glTF node under an entity node and then adjust the scale property of the entity node. For detailed information on glTF, please refer to the following chapters.

### Node Search

There is a search box at the top of the node panel where users can enter the name of a node to search for it in the scene. The search box supports fuzzy search, allowing you to enter partial characters of the node name to find it.

### Node Visibility

Each entity node has an eye button on the right side that can toggle the visibility of the node in the scene. It is important to note that adjusting the node's display status here is only a modification in the workspace and not the `isActive` property in the **[Inspector Panel](/en/docs/interface/inspector)**.

## Script Usage

### Creating New Entities

In the [scene](/en/docs/core/scene), it has been explained how to get the active scene. In a new scene, we usually start by adding a root node:

```typescript
const scene = engine.sceneManager.activeScene;
const rootEntity = scene.createRootEntity();
```

Typically, new entities are created by adding child entities:

```typescript
const newEntity = rootEntity.createChild("firstEntity");
```

Of course, entities can also be created directly. However, these entities are detached and do not appear in the scene until they are associated with entities on the hierarchy tree. 

{ /*examples*/ }

```typescript
const newEntity = new Entity(engine, "firstEntity");
rootEntity.addChild(newEntity);
```

### Delete Entity

When an entity is no longer needed in the scene, we can delete it:

```typescript
rootEntity.removeChild(newEntity);
```

It is worth noting that this method only releases the object from the hierarchy tree, not displaying it in the scene. If complete destruction is needed:

```typescript
newEntity.destroy();
```

### Find Child Entity

In the case of knowing the parent entity, we usually obtain the child entity through the parent entity:

```typescript
const childrenEntity = newEntity.children;
```

If the index of the child entity in the parent entity is known, you can directly use [getChild](/apis/core/#Entity-getChild):

```typescript
newEntity.getChild(0);
```

If the index of the child entity is not clear, you can use [findByName](/apis/core/#Entity-findByName) to search by name. `findByName` not only searches for child entities but also searches for grandchildren entities.

```typescript
newEntity.findByName("model");
```

If there are entities with the same name, you can use [findByPath](/apis/core/#Entity-findByPath) and pass in the path for hierarchical search. Using this API will also improve search efficiency to some extent.

```typescript
newEntity.findByPath("parent/child/grandson");
```

### State

When an entity is temporarily not in use, you can stop its activation by calling the entity's [isActive](/apis/core/#Entity-isActive) method. At the same time, the components under this entity will be passively disabled by `component.enabled = false`.

```typescript
newEntity.isActive = false;
```
