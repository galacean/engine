---
order: 1
title: Script Class
type: Script
label: Script
---

The base class for custom scripts is [Script](/apis/core/#Script), which extends [Component](/en/docs/core/component). Therefore, in addition to the basic capabilities of components, it also supports:

- Mounting on [Entity](/en/docs/core/entity)
- Conveniently accessing node instances and component instances
- Following the disable and destroy rules of components
- ...

Furthermore, scripts provide a rich set of lifecycle callback functions. As long as specific callback functions are overridden in the script, they do not need to be manually called, and Galacean will automatically execute the relevant scripts at specific times.

## Script Lifecycle

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_8C-TJP2UIgAAAAAAAAAAAAAARQnAQ" alt="Script Lifecycle" style="zoom:67%;" />

> [onBeginRender](/apis/core/#Script-onBeginRender) and [onEndRender](/apis/core/#Script-onEndRender) have some differences compared to others.
>
> **They are only called** when the entity has mounted a camera component, meaning when a camera component has been added.

### [**onAwake**](/apis/core/#Script-onAwake)

If the [isActiveInHierarchy](/apis/core/#Entity-isactiveinhierarchy) of the entity to which the script is added is `true`, the callback function will be called when the script is initialized. If [isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) is `false`, it will be called when the entity is activated, meaning [isActive](/apis/core/#Entity-isActive) is set to `true`. `onAwake` is only called once and is the first in all lifecycles. Typically, initialization-related operations are done in `onAwake`:

```typescript
onAwake() {
	this.child = this.entity.getChild(0);
	this.child.isActive = false;
}
```

### [**onEnable**](/apis/core/#Script-onEnable)

The `onEnable` callback is activated when the [enabled](/apis/core/#Component-enabled) property of the script changes from `false` to `true`, or when the [isActiveInHierarchy](/apis/core/#Entity-isactiveinhierarchy) property of the entity changes from `false` to `true. If the entity is created for the first time and [enabled](/apis/core/#Component-enabled) is `true`, it will be called after `onAwake` and before `onStart`.

### [**onDisable**](/apis/core/#Script-ondisable)

The `onDisable` callback is activated when the [enabled](/apis/core/#Component-enabled) property of the component changes from `true` to `false`, or when the [isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) property of the entity changes from `true` to `false`.

Note: The determination of [isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) is that the entity is active in the hierarchy tree, meaning the entity is active, and its parent and ancestors up to the root entity are also active for [isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) to be `true`.

### [**onStart**](/apis/core/#Script-onStart)

The `onStart` callback is triggered before the script enters the frame loop for the first time, which is before the first execution of `onUpdate`. `onStart` is typically used to initialize data that may change frequently during `onUpdate`.

```typescript
onStart() {
	this.updateCount = 0
}

onUpdate() {
	this.updateCount++;
}
```

It is important to note that Galacean executes `onStart` callbacks in batches before executing `onUpdate` callbacks in batches. This allows accessing values initialized in other entities in `onUpdate`.

```typescript
import { TheScript } from './TheScript'
onStart() {
	this.otherEntity = Entity.findByName('otherEntity');
	this.otherEntityScript = this.otherEntity.getComponent(TheScript)
}

onUpdate() {
	console.log(this.otherEntityScript.updateCount)
}
```

### [**onPhysicsUpdate**](/apis/core/#Script-onPhysicsUpdate)

`onPhysicsUpdate` callback function is called at the same frequency as the physics engine update. It may be called multiple times per rendering frame.

### [**onTriggerEnter**](/apis/core/#Script-onTriggerEnter)

The `onTriggerEnter` callback function is called when triggers make contact with each other to handle the logic when triggers meet, such as deleting entities when a trigger occurs.

### [**onTriggerStay**](/apis/core/#Script-onTriggerStay)

The `onTriggerStay` callback function is called **continuously** during the trigger contact, once per frame.

### [**onTriggerExit**](/apis/core/#Script-onTriggerExit)

The `onTriggerExit` callback function is called when two triggers separate, meaning the trigger relationship changes, and it is called only once.

### [**onCollisionEnter**](/apis/core/#Script-onCollisionEnter)

The `onCollisionEnter` callback function is called when colliders collide to handle the logic when colliders meet, such as deleting entities when a collision occurs.

### [**onCollisionStay**](/apis/core/#Script-onCollisionStay)

The `onCollisionStay` callback function is called **continuously** during the collider collision, once per frame.

### [**onCollisionExit**](/apis/core/#Script-onCollisionExit)

The `onCollisionExit` callback function is called when two colliders separate, meaning the collision relationship changes, and it is called only once.

### [**onUpdate**](/apis/core/#Script-onUpdate)

A key point in game/animation development is updating the behavior, state, and position of objects before each frame rendering. These update operations are usually placed in the `onUpdate` callback. It receives a parameter representing the time difference from the last `onUpdate` execution, of type `number`.

```typescript
onStart() {
	this.rotationY = 0
}

onUpdate(deltaTime: number) {
	this.entity.transform.rotate(new Vector3(0, this.rotationY++, 0))
}
```

### [**onLateUpdate**](/apis/core/#Script-onLateUpdate)

`onUpdate` is executed before all animation updates, but if we need to perform additional operations after the animation effects (such as animations, particles, etc.) are updated, or if we want to perform other operations only after all components' `onUpdate` have been executed, such as camera following, then we need to use the `onLateUpdate` callback. It receives a parameter representing the time difference from the last `onLateUpdate` execution, of type `number`.

```typescript
onStart() {
	this.rotationY = 0
}

onUpdate() {
	this.entity.transform.rotate(new Vector3(0, this.rotationY++, 0))
}

onLateUpdate(deltaTime: number) {
	this.rotationY %= 360;
}
```

### [**onBeginRender**](/apis/core/#Script-onBeginRender)

**Only when the entity is mounted with a camera component**, the `onBeginRender` callback will be called before the [render](/apis/core/#Camera-render) method of the camera component is invoked.

### [**onEndRender**](/apis/core/#Script-onEndRender)

**Only when the entity is mounted with a camera component**, the `onEndRender` callback will be called after the [render](/apis/core/#Camera-render) method of the camera component is invoked.

### [**onDestroy**](/apis/core/#Script-onDestroy)

When a component or the entity it belongs to calls [destroy](/apis/core/#Entity-destroy), the `onDestroy` callback is invoked, and the components are uniformly recycled at the end of the frame.

### onPointerXXX

For details on the input system interface, see [Input Interaction](/en/docs/input).

## Entity Operations

[Entities](/en/docs/core/entity) are the main objects of scripts. You can modify nodes and components in the editor's scene inspector and dynamically modify them in scripts. Scripts can respond to player input, modify, create, and destroy entities or components, thereby implementing various game logics.

### Accessing Entities and Components

You can access the entity to which the script is bound at any lifecycle, like:

```typescript
class MyScript extends Script {
  onAwake() {
    const entity = this.entity;
  }
}
```

### Getting Other Components

When we need to get other components on the same node, we use the [getComponent](/apis/core/#Entity-getComponent) API, which helps you find the component you need.

```typescript
onAwake() {
 	const components = []
	this.entity.getComponents(o3.Model, components);
}
```

Sometimes there may be multiple components of the same type, the above method will only return the first component found. If you need to find all components, you can use [getComponents](/apis/core/#Entity-getComponents).

### Transformation

Taking rotation as an example, rotate the entity in the [onUpdate](/apis/core/#Script-onUpdate) using the [setRotation](/apis/core/#Transform-setRotation) method:

```typescript
this.entity.transform.setRotation(0, 5, 0);
```

```typescript
onAwake() {
	const component = this.entity.getComponent(o3.Model);
}
```

### Finding Child Nodes

Sometimes, there may be many objects of the same type in the scene, like multiple particle animations, multiple coins, which are usually managed by a global script. If associating them one by one to this script, the work will be cumbersome. To better manage these objects, we can place them under a unified parent object and then get all child objects through the parent object:

If you know the index of the child node in the parent node, you can directly use [getChild](/apis/core/#Entity-getChild):

```typescript
onAwake() {
	this.entity.getChild(0);
}
```

If you are unsure about the index of the child node, you can use [findByName](/apis/core/#Entity-findByName) to find it by the node's name. [findByName](/apis/core/#Entity-findByName) not only searches for child nodes but also searches for grandchildren nodes.

```typescript
onAwake() {
	this.entity.findByName('model');
}
```

If there are nodes with the same name, you can use [findByPath](/apis/core/#Entity-findByPath) by passing the path for a step-by-step search. Using this API will also improve the search efficiency to some extent.

```typescript
onAwake() {
	this.entity.findByPath('parent/child/grandson');
}
```
