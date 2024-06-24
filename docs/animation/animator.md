---
order: 3
title: 动画控制组件
type: 动画
label: Animation
---

动画控制组件（[Animator](/apis/core/#Animator)）的作用是读取[动画控制器](/docs/animation-animatorController)（[AnimatorController](/apis/core/#AnimatorController)）的数据，并播放其内容。

### 参数说明

| 属性               | 功能说明                       |
| :----------------- | :----------------------------- |
| animatorController | 绑定 `AnimatorController` 资产 |

## 编辑器使用

1. 当我们把模型拖入到场景中，模型以初始姿态展示出来，但是并不会播放任何动画，我们需要在模型实体上添加动画控制组件（[Animator](/apis/core/#Animator)）

![2](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*kuSLTaxomrUAAAAAAAAAAAAADsJ_AQ/original)

2. 动画控制组件（[Animator](/apis/core/#Animator)）需要绑定一个 [动画控制器](/docs/animation-animatorController) 资产，我们创建并绑定

![3](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*irT7SZvw4N8AAAAAAAAAAAAADsJ_AQ/original)

![4](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*VtX3RJR8kdMAAAAAAAAAAAAADsJ_AQ/original)

3. 至此你在导出的项目中就可以通过 `animator.play` 播放[动画控制器](/docs/animation-animatorController)中的动画了。

如果你没有为实体添加 动画控制组件（[Animator](/apis/core/#Animator)）的话 Galacean Engine 会为你默认创建一个并且 [动画控制器](/docs/animation-animatorController) 中默认添加了模型的所有动画片段，当然除此以外你可以通过 [动画控制器](/docs/animation-animatorController) 实现更多的功能。

## 脚本使用

> 在使用脚本之前，最好阅读[动画系统构成](/docs/animation-system)文档，以帮助你更好的了解动画系统的运行逻辑

### 播放动画

在加载 GLTF 模型后引擎会自动为模型添加一个 Animator 组件，并将模型中的动画片段加入其中。可以直接在模型的根实体上获取 Animator 组件，并播放指定动画。

```typescript
engine.resourceManager
  .load<GLTFResource>(
    "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb"
  )
  .then((asset) => {
    const { defaultSceneRoot } = asset;
    rootEntity.addChild(defaultSceneRoot);
    const animator = defaultSceneRoot.getComponent(Animator);
    animator.play("run");
  });
```

#### 控制播放速度

你可以通过 [speed](/apis/core/#Animator-speed)  属性来控制动画的播放速度。 `speed`  默认值为 `1.0` ，值越大播放的越快，越小播放的越慢。当值为负数时，进行倒播。

```typescript
animator.speed = 2.0；
```

#### 暂停/恢复播放

你可以通过设置 Animator 的 [enabled](/apis/core/#Animator-enabled) 来控制动画的暂停和播放.

```typescript
// 暂停
animator.enabled = false;
// 恢复
animator.enabled = true;
```

如果你只想针对某一个动画状态进行暂停，可以通过将它的速度设置为 0 来实现。

```typescript
const state = animator.findAnimatorState("xxx");
state.speed = 0;
```

#### 播放指定动画状态

<playground src="skeleton-animation-play.ts"></playground>

你可以使用 [play](/apis/core/#Animator-play)  方法来播放指定的 AnimatorState。参数为 AnimatorState 的`name`，其他参数说明详见[API 文档](/apis/core/#Animator-play)。

```typescript
animator.play("run");
```

如果需要在动画中的某一时刻开始播放可以通过以下方式

```typescript
const layerIndex = 0;
const normalizedTimeOffset = 0.5; // 归一化的时间
animator.play("run", layerIndex, normalizedTimeOffset);
```

### 获取当前在播放的动画状态

你可以使用 [getCurrentAnimatorState](/apis/core/#Animator-getCurrentAnimatorState)  方法来获取当前正在播放的 AnimatorState。参数为动画状态所在层的序号`layerIndex`, 详见[API 文档](/apis/core/#Animator-getCurrentAnimatorState)。获取之后可以设置动画状态的属性，比如将默认的循环播放改为一次。

```typescript
const currentState = animator.getCurrentAnimatorState(0);
// 播放一次
currentState.wrapMode = WrapMode.Once;
// 循环播放
currentState.wrapMode = WrapMode.Loop;
```

### 获取动画状态

你可以使用 [findAnimatorState](/apis/core/#Animator-findAnimatorState)  方法来获取指定名称的 AnimatorState。详见[API 文档](/apis/core/#Animator-getCurrentAnimatorState)。获取之后可以设置动画状态的属性，比如将默认的循环播放改为一次。

```typescript
const state = animator.findAnimatorState("xxx");
// 播放一次
state.wrapMode = WrapMode.Once;
// 循环播放
state.wrapMode = WrapMode.Loop;
```
