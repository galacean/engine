---
order: 1
title: Script Class
type: Script
label: Script
---

Scripts are the bridge between engine capabilities and game logic. They can be used to extend the engine's functionality and to write your own game logic code in the lifecycle hook functions provided by script components. The base class for custom scripts is [Script](/en/apis/core/#Script), which extends from [Component](/en/docs/core/component). Therefore, it not only supports the basic capabilities of components:

- Mounting to [Entity](/en/docs/core/entity)
- Conveniently obtaining node instances and component instances
- Following the disable and destroy rules of components

Additionally, it provides a rich set of lifecycle callback functions. As long as specific callback functions are overridden in the script, you don't need to manually call them; Galacean will automatically execute the relevant scripts at specific times.

## Script Lifecycle

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_8C-TJP2UIgAAAAAAAAAAAAAARQnAQ" alt="Script Lifecycle-zh" style="zoom:67%;" />

> [onBeginRender](/en/apis/core/#Script-onBeginRender) and [onEndRender](/en/apis/core/#Script-onEndRender) are somewhat different from the others.
>
> **They are called only when the entity has a camera component mounted**, meaning they are called when a camera component is added.

### onAwake

If the [isActiveInHierarchy](/en/apis/core/#Entity-isactiveinhierarchy) of the entity to which the script is added is `true`, the callback function will be called when the script is initialized. If [isActiveInHierarchy](/en/apis/core/#Entity-isActiveInHierarchy) is `false`, it will be called when the entity is activated, i.e., when [isActive](/en/apis/core/#Entity-isActive) is set to `true`. `onAwake` will only be called once and is at the very beginning of all lifecycles. Typically, we perform some initialization-related operations in `onAwake`:

```typescript
onAwake() {
	this.child = this.entity.getChild(0);
	this.child.isActive = false;
}
```

### onEnable

The `onEnable` callback is activated when the [enabled](/en/apis/core/#Component-enabled) property of the script changes from `false` to `true`, or when the [isActiveInHierarchy](/en/apis/core/#Entity-isactiveinhierarchy) property of the entity changes from `false` to `true`. If the entity is created for the first time and [enabled](/en/apis/core/#Component-enabled) is `true`, it will be called after `onAwake` and before `onStart`.

### onDisable

The `onDisable` callback is activated when the [enabled](/en/apis/core/#Component-enabled) property of the component changes from `true` to `false`, or when the [isActiveInHierarchy](/en/apis/core/#Entity-isActiveInHierarchy) property of the entity changes from `true` to `false`.

Note: The [isActiveInHierarchy](/en/apis/core/#Entity-isActiveInHierarchy) check means that the entity is in an active state in the hierarchy tree, i.e., the entity is active, and its parent and all ancestors up to the root entity are also active. Only then is [isActiveInHierarchy](/en/apis/core/#Entity-isActiveInHierarchy) `true`.

### onStart

The `onStart` callback function is triggered the first time the script enters the frame loop, i.e., before the first execution of `onUpdate`. `onStart` is usually used to initialize some data that needs to be frequently modified, which may change during `onUpdate`.

```typescript
onStart() {
	this.updateCount = 0
}

onUpdate() {
	this.updateCount++;
}
```

It is important to note that Galacean executes the `onStart` callbacks in bulk before executing the `onUpdate` callbacks in bulk. The benefit of this approach is that you can access the initialized values of other entities in `onUpdate`.

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

### onPhysicsUpdate

The `onPhysicsUpdate` callback function is called at the same frequency as the physics engine update rate. It may be called multiple times per render frame.

### onTriggerEnter

The `onTriggerEnter` callback function is called when triggers come into contact to handle the logic when triggers meet, such as deleting an entity when the trigger occurs.

### onTriggerStay

The `onTriggerStay` callback function is called **continuously** during the trigger contact process, once per frame.

### onTriggerExit

The `onTriggerExit` callback function is called when two triggers separate, i.e., when the trigger relationship changes, and it is called only once.

### onCollisionEnter

The `onCollisionEnter` callback function is called when colliders collide to handle the logic when colliders meet, such as deleting an entity when the collision occurs.

### onCollisionStay

The `onCollisionStay` callback function is called **continuously** during the collider collision process, once per frame.

### onCollisionExit

The `onCollisionExit` callback function is called when two colliders separate, i.e., when the collision relationship changes, and it is called only once.

### onUpdate

A key point in game/animation development is to update the behavior, state, and position of objects before each frame is rendered. These update operations are usually placed in the `onUpdate` callback. It receives a parameter representing the time difference since the last `onUpdate` execution, of type `number`.

```typescript
onStart() {
	this.rotationY = 0
}

onUpdate(deltaTime: number) {
	this.entity.transform.rotate(new Vector3(0, this.rotationY++, 0))
}
```

### onLateUpdate

`onUpdate` is executed before all animation updates, but if we want to perform some additional operations after the effects (such as animations, particles, etc.) are updated, or if we want to perform other operations such as camera follow after all components' `onUpdate` have been executed, we need to use the `onLateUpdate` callback. It receives a parameter representing the time difference since the last `onLateUpdate` execution, of type `number`.

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

### onBeginRender

**Only when the entity has a camera component attached**, the `onBeginRender` callback will be called before the camera component's [render](/en/apis/core/#Camera-render) method is called.

### onEndRender

**Only when the entity has a camera component attached**, the `onEndRender` callback will be called after the camera component's [render](/en/apis/core/#Camera-render) method is called.

### onDestroy

When a component or its entity calls [destroy](/en/apis/core/#Entity-destroy), the `onDestroy` callback will be called, and the component will be uniformly recycled at the end of the frame.

### onPointerXXX

For input system interfaces, see [Input Interaction](/en/docs/input).

## Entity Operations

[Entities](/en/docs/core/entity) are the main objects operated by scripts. You can modify nodes and components in the editor's scene inspector, and you can also dynamically modify them in scripts. Scripts can respond to player input, modify, create, and destroy entities or components to achieve various game logic.

### Accessing Entities and Components

You can obtain the entity bound to the script in any lifecycle of the script, such as:

```typescript
class MyScript extends Script {
  onAwake() {
    const entity = this.entity;
  }
}
```

### Obtaining Other Components

When we need to get other components on the same node, we use the [getComponent](/en/apis/core/#Entity-getComponent) API, which helps you find the component you need.

```typescript
onAwake() {
 	const components = []
	this.entity.getComponents(o3.Model, components);
}
```

Sometimes there may be multiple components of the same type, and the above method will only return the first found component. If you need to find all components, you can use [getComponents](/en/apis/core/#Entity-getComponents).

### Transformation

For example, to rotate an entity in the [onUpdate](/en/apis/core/#Script-onUpdate) method using the [setRotation](/en/apis/core/#Transform-setRotation) method:

```typescript
this.entity.transform.setRotation(0, 5, 0);
```

```typescript
onAwake() {
	const component = this.entity.getComponent(o3.Model);
}
```

### Finding Child Nodes

Sometimes, there are many objects of the same type in the scene, such as multiple particle animations or multiple coins, which usually have a global script to manage them uniformly. If you associate them with this script one by one, the work will be cumbersome. To better manage these objects, we can place them under a unified parent object and then obtain all child objects through the parent object:

If you know the index of the child node in the parent node, you can directly use [getChild](/en/apis/core/#Entity-getChild):

```typescript
onAwake() {
	this.entity.getChild(0);
}
```

If you don't know the index of the child node, you can use [findByName](/en/apis/core/#Entity-findByName) to find it by the node's name. [findByName](/en/apis/core/#Entity-findByName) will search not only child nodes but also grandchild nodes.

```typescript
onAwake() {
	this.entity.findByName('model');
}
```

If there are nodes with the same name, you can use [findByPath](/en/apis/core/#Entity-findByPath) to pass in the path for step-by-step search. Using this API will also improve search efficiency to some extent.

```typescript
onAwake() {
	this.entity.findByPath('parent/child/grandson');
}
```
