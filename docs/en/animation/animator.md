---
order: 3
title: Animation Control Component
type: Animation
label: Animation
---

The Animation Control Component ([Animator](/apis/core/#Animator)) is responsible for reading data from an [Animator Controller](/en/docs/animation/animatorController/) ([AnimatorController](/apis/core/#AnimatorController)) and playing its content.

### Parameter Description

| Property            | Description                    |
| :------------------ | :-----------------------------  |
| animatorController  | Binds the `AnimatorController` asset |

## Editor Usage

1. When we drag a model into the scene, the model is displayed in its initial pose but does not play any animation. We need to add an Animation Control Component ([Animator](/apis/core/#Animator}) to the model entity.

![2](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*kuSLTaxomrUAAAAAAAAAAAAADsJ_AQ/original)

2. The Animation Control Component ([Animator](/apis/core/#Animator}) needs to be bound to an [Animator Controller](/en/docs/animation/animatorController/}) asset. We create and bind it.

![3](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*irT7SZvw4N8AAAAAAAAAAAAADsJ_AQ/original)

![4](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*VtX3RJR8kdMAAAAAAAAAAAAADsJ_AQ/original)

3. Now you can play the animations in the [Animator Controller](/en/docs/animation/animatorController/) in your exported project using `animator.play`.

If you haven't added an Animation Control Component ([Animator](/apis/core/#Animator}) to the entity, Galacean Engine will create one for you by default, and the [Animator Controller](/en/docs/animation/animatorController/}) will automatically add all animation clips of the model. Of course, you can achieve more functionality through the [Animator Controller](/en/docs/animation/animatorController/}).

## Script Usage

> Before using scripts, it is recommended to read the [Animation System Composition](/en/docs/animation/system/) document to help you better understand the animation system's operational logic.

### Play Animation

After loading a GLTF model, the engine will automatically add an Animator component to the model and include the animation clips from the model. You can directly access the Animator component on the root entity of the model and play a specific animation.

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

#### Control Playback Speed

You can control the playback speed of the animation using the [speed](/apis/core/#Animator-speed) property. The `speed` default value is `1.0`, where a higher value speeds up the playback and a lower value slows it down. When the value is negative, the animation plays in reverse.

```typescript
animator.speed = 2.0;
```

#### Pause/Resume Playback

You can control the pause and play of the animation by setting the Animator's [enabled](/apis/core/#Animator-enabled) property.

```typescript
// 暂停
animator.enabled = false;
// 恢复
animator.enabled = true;
```

If you want to pause a specific animation state, you can achieve this by setting its speed to 0.

```typescript
const state = animator.findAnimatorState("xxx");
state.speed = 0;
```

#### Play a Specific Animation State

<playground src="skeleton-animation-play.ts"></playground>

You can use the [play](/apis/core/#Animator-play) method to play a specific AnimatorState. The parameter is the `name` of the AnimatorState. For more details on other parameters, refer to the [API documentation](/apis/core/#Animator-play}).

```typescript
animator.play("run");
```

If you need to start playing at a certain moment in the animation, you can do so as follows:

```typescript
const layerIndex = 0;
const normalizedTimeOffset = 0.5; // Normalized time
animator.play("run", layerIndex, normalizedTimeOffset);
```

### Get the current playing animation state

You can use the [getCurrentAnimatorState](/apis/core/#Animator-getCurrentAnimatorState) method to get the currently playing AnimatorState. The parameter is the index of the layer where the animation state is located, see [API documentation](/apis/core/#Animator-getCurrentAnimatorState) for details. After obtaining it, you can set the properties of the animation state, such as changing the default loop playback to once.

```typescript
const currentState = animator.getCurrentAnimatorState(0);
// 播放一次
currentState.wrapMode = WrapMode.Once;
// 循环播放
currentState.wrapMode = WrapMode.Loop;
```

### Get the animation state

You can use the [findAnimatorState](/apis/core/#Animator-findAnimatorState) method to get the AnimatorState with the specified name. See [API documentation](/apis/core/#Animator-getCurrentAnimatorState) for details. After obtaining it, you can set the properties of the animation state, such as changing the default loop playback to once.

```typescript
const state = animator.findAnimatorState("xxx");
// 播放一次
state.wrapMode = WrapMode.Once;
// 循环播放
state.wrapMode = WrapMode.Loop;
```
