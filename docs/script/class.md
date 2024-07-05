---
order: 1
title: 脚本类
type: 脚本
label: Script
---

脚本是衔接引擎能力和游戏逻辑的纽带，可以通过它来扩展引擎的功能，也可以脚本组件提供的生命周期钩子函数中编写自己的游戏逻辑代码。自定义脚本的基类是 [Script](/apis/core/#Script) ，它扩展自 [Component](/docs/core-component)，因此组件包含的能力与操作，它不仅支持组件的基础能力：

- 挂载到 [Entity](/docs/core-entity) 上
- 方便地获取节点实例，组件实例
- 遵循组件的禁用销毁规则
- ……

除此以外，脚本还提供丰富的生命周期回调函数，只要脚本中重写特定的回调函数，不需要手工调用它们，Galacean 就会在特定的时期自动执行相关脚本。

## 脚本生命周期

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_8C-TJP2UIgAAAAAAAAAAAAAARQnAQ" alt="脚本生命周期-zh" style="zoom:67%;" />

> [onBeginRender](/apis/core/#Script-onBeginRender) 和 [onEndRender](/apis/core/#Script-onEndRender) 这两个生命周期与其他的有些不同。
>
> **当且仅当实体挂载了相机组件** 也就是添加了相机组件时，他们才会被调用。

### [**onAwake**](/apis/core/#Script-onAwake)

如果脚本添加到的实体的 [isActiveInHierarchy](/apis/core/#Entity-isactiveinhierarchy) 为 `true`，则在脚本初始化时回调函数将被调用，如果[isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) 为 `false`，则在实体被激活，即 [isActive](/apis/core/#Entity-isActive)  被设为 `true`  时被调用。 `onAwake`  只会被调用一次，并且在所有生命周期的最前面，通常我们会在 `onAwake`  中做一些初始化相关的操作：

```typescript
onAwake() {
	this.child = this.entity.getChild(0);
	this.child.isActive = false;
}
```

### [**onEnable**](/apis/core/#Script-onEnable)

当脚本的 [enabled](/apis/core/#Component-enabled) 属性从 `false` 变为 `true` 时，或者所在实体的 [isActiveInHierarchy](/apis/core/#Entity-isactiveinhierarchy) 属性从 `false` 变为 `true` 时，会激活 `onEnable` 回调。倘若实体第一次被创建且 [enabled](/apis/core/#Component-enabled) 为 `true`，则会在 `onAwake` 之后，`onStart` 之前被调用。

### [**onDisable**](/apis/core/#Script-ondisable)

当组件的 [enabled](/apis/core/#Component-enabled) 属性从 `true` 变为 `false` 时，或者所在实体的 [isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) 属性从 `true` 变为 `false` 时，会激活 `onDisable` 回调

注意：[isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) 的判断方法为实体在层级树中是被激活状态即该实体为激活状态，它的父亲及父亲的父亲直到根实体都为激活状态 [isActiveInHierarchy](/apis/core/#Entity-isActiveInHierarchy) 才为 `true`

### [**onStart**](/apis/core/#Script-onStart)

`onStart` 回调函数会在脚本第一次进入帧循环，也就是第一次执行 `onUpdate` 之前触发。`onStart` 通常用于初始化一些需要经常修改的数据，这些数据可能在 `onUpdate` 时会发生改变。

```typescript
onStart() {
	this.updateCount = 0
}

onUpdate() {
	this.updateCount++;
}
```

需要注意的是，Galacean 在批量执行完 `onStart` 回调后再批量执行 `onUpdate` 回调。这样做的好处是可以在 `onUpdate` 中访问其他实体初始化的值。

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

`onPhysicsUpdate` 回调函数调用频率与物理引擎更新频率保持一致。每个渲染帧可能会调用多次。

### [**onTriggerEnter**](/apis/core/#Script-onTriggerEnter)

`onTriggerEnter` 回调函数会在触发器相互接触时调用，以处理触发器相遇时的逻辑，例如在触发发生时删除实体。

### [**onTriggerStay**](/apis/core/#Script-onTriggerStay)

`onTriggerStay` 回调函数会在触发器接触过程中**持续**调用，每帧调用一次。

### [**onTriggerExit**](/apis/core/#Script-onTriggerExit)

`onTriggerExit` 回调函数会在两个触发器分离时被调用，即触发关系发生改变，只调用一次。

### [**onCollisionEnter**](/apis/core/#Script-onCollisionEnter)

`onCollisionEnter` 回调函数会在碰撞器碰撞时调用，以处理碰撞体相遇时的逻辑，例如在碰撞发生时删除实体。

### [**onCollisionStay**](/apis/core/#Script-onCollisionStay)

`onCollisionStay` 回调函数会在碰撞器碰撞过程中**持续**调用，每帧调用一次。

### [**onCollisionExit**](/apis/core/#Script-onCollisionExit)

`onCollisionExit` 回调函数会在两个碰撞器分离时被调用，即碰撞关系发生改变，只调用一次。

### [**onUpdate**](/apis/core/#Script-onUpdate)

游戏/动画开发的一个关键点是在每一帧渲染前更新物体的行为，状态和方位。这些更新操作通常都放在 `onUpdate` 回调中。接收与上一次 `onUpdate` 执行时间差参数, 类型是 `number`

```typescript
onStart() {
	this.rotationY = 0
}

onUpdate(deltaTime: number) {
	this.entity.transform.rotate(new Vector3(0, this.rotationY++, 0))
}
```

### [**onLateUpdate**](/apis/core/#Script-onLateUpdate)

`onUpdate` 会在所有动画更新前执行，但如果我们要在动效（如动画、粒子等）更新之后才进行一些额外操作，或者希望在所有组件的 `onUpdate` 都执行完之后才进行其它操作比如相机跟随，那就需要用到 `onLateUpdate` 回调。接收与上一次 `onLateUpdate` 执行时间差参数, 类型是 `number`

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

**当且仅当实体挂载了相机组件**，那么相机组件的 [render](/apis/core/#Camera-render) 方法调用之前 `onBeginRender` 回调将被调用。

### [**onEndRender**](/apis/core/#Script-onEndRender)

**当且仅当实体挂载了相机组件**，那么相机组件的 [render](/apis/core/#Camera-render) 方法调用之后 `onEndRender` 回调将被调用。

### [**onDestroy**](/apis/core/#Script-onDestroy)

当组件或者所在实体调用了 [destroy](/apis/core/#Entity-destroy)，则会调用 `onDestroy` 回调，并在当帧结束时统一回收组件。

### onPointerXXX

输入系统接口详见[输入交互](/docs/input)。

## 实体操作

[实体](/docs/core-entity)是脚本的主要操作对象。你可以在编辑器场景检查器里修改节点和组件，也能在脚本中动态修改。脚本能够响应玩家输入，能够修改、创建和销毁实体或组件，从而实现各种各样的游戏逻辑。

### 访问实体和组件

你可以在脚本的任意生命周期内获得它所绑定的实体，如：

```typescript
class MyScript extends Script {
  onAwake() {
    const entity = this.entity;
  }
}
```

### 获得其它组件

当我们需要获取同一节点上的其他组件，这时就要用到 [getComponent](/apis/core/#Entity-getComponent) 这个 API, 它会帮你查找你要的组件。

```typescript
onAwake() {
 	const components = []
	this.entity.getComponents(o3.Model, components);
}
```

有些时候可能会有多个同一类型的组件，上面的方法只会返回第一个找到的组件，如果需要找到所有组件可以用 [getComponents](/apis/core/#Entity-getComponents)。

### 变换

以旋转为例，在 [onUpdate](/apis/core/#Script-onUpdate) 中通过 [setRotation](/apis/core/#Transform-setRotation) 方法来旋转实体：

```typescript
this.entity.transform.setRotation(0, 5, 0);
```

```typescript
onAwake() {
	const component = this.entity.getComponent(o3.Model);
}
```

### 查找子节点

有时候，场景中会有很多个相同类型的对象，像多个粒子动画，多个金币，它们通常都有一个全局的脚本来统一管理。如果用一个一个将它们关联到这个脚本上，那工作就会很繁琐。为了更好地统一管理这些对象，我们可以把它们放到一个统一的父物体下，然后通过父物体来获得所有的子物体：

如果明确知道子节点在父节点中的 index 可以直接使用 [getChild](/apis/core/#Entity-getChild) ：

```typescript
onAwake() {
	this.entity.getChild(0);
}
```

如果不清楚子节点的 index，可以使用 [findByName](/apis/core/#Entity-findByName) 通过节点的名字找到它, [findByName](/apis/core/#Entity-findByName) 不仅会查找子节点，还会查找孙子节点

```typescript
onAwake() {
	this.entity.findByName('model');
}
```

如果有同名的节点可以使用 [findByPath](/apis/core/#Entity-findByPath) 传入路径进行逐级查找，使用此 API 也会一定程度上提高查找效率。

```typescript
onAwake() {
	this.entity.findByPath('parent/child/grandson');
}
```
