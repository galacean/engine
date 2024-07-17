---
order: 5
title: Animation State Machine
type: Animation
label: Animation
---

### Animation Transition

To achieve the animation transition effect, simply connect two `AnimatorState` that you want to transition between. Click on the line between the two animations to modify the transition parameters and adjust the effect.

![animationcrossfade](https://gw.alipayobjects.com/zos/OasisHub/cd8fa035-0c1c-493e-a0c7-54d301f96156/1667458692286-29d9f543-9b98-4911-8fa7-ac38b61b1668.gif)

#### Parameter Description

| Attribute | Function Description |
| :------- | :---------------------------------------------------------|
| duration | Transition duration, time is normalized time relative to the target state, default value is 1.0            |
| offset   | Offset time forward from the target state, time is normalized time relative to the target state, default value is 0  |
| exitTime | Start state transition start time, time is normalized time relative to the start state, default value is 0.3  |

#### Script Usage

You can achieve transitions between animation states by adding `AnimatorTransition` to `AnimatorState`.

```typescript
const walkState = animatorStateMachine.addState('walk');
walkState.clip = walkClip;
const runState = animatorStateMachine.addState('run');
runState.clip = runClip;
const transition = new AnimatorStateTransition();
transition.duration = 1;
transition.offset = 0;
transition.exitTime = 0.5;
transition.destinationState = runState;
walkState.addTransition(transition);
animator.play("walk");
```
By doing this, every time you play the `walk` animation in the layer where this animation state machine is located, it will transition to the `run` animation halfway through.

### Animation Overlay

Galacean Engine supports multi-layer animation overlay. Animation overlay is achieved through blending between `AnimatorControllerLayer`. The first layer is the base animation layer, modifying its weight and blending mode will not take effect.

Double-click on the `AnimatorController` asset file to edit the animation, add a layer, and connect the blended actions to `entry`.

![animationadditive](https://gw.alipayobjects.com/zos/OasisHub/7548a66b-a72f-4cad-9b27-c9f1a2824aff/1667459461151-4568a32a-07db-427b-922e-3bc6f844097b.gif)

Sometimes you may want to achieve a fixed pose by trimming the animation slices provided by the designer. You can modify the `StartTime` and `EndTime` of the `AnimatorState` as shown in the image above, click on the `AnimatorState` to edit it:

![1](https://gw.alipayobjects.com/zos/OasisHub/cc0db4c9-95f9-48d7-a3ac-48d69e94a31d/1.jpg)

| Attribute | Function Description |
| :------- | :------------------------------------------------------------------- |
| Name          | Modify the name of the `AnimatorState`, the name must be **unique** within the layer.           |
| AnimationClip | Used to bind the `AnimationClip` asset, `AnimationClip` stores the animation data of the model. |
| WrapMode      | Whether `AnimatorState` loops or plays once, default is `Once` for playing once.     |
| Speed         | Playback speed of `AnimatorState`, default value is 1.0, the higher the value, the faster the animation speed.          |
| StartTime     | Where in the `AnimationClip` the `AnimatorState` starts playing, time is normalized time relative to the duration of the `AnimationClip`. Default value is 0, starting from the beginning. For example: a value of 1.0 is the last frame of the `AnimationClip`.        |
| EndTime       | Where in the `AnimationClip` the `AnimatorState` stops playing, time is normalized time relative to the duration of the `AnimationClip`. Default value is 1.0, playing until the end.                                                      |

You can also adjust the weight of the `Layer` in the blend by modifying the `Weight` parameter of the `Layer` and change the blending mode by modifying `Blending`.

![animationadditive2](https://gw.alipayobjects.com/zos/OasisHub/acd80bdf-7c8d-41ac-8a2f-fe75cc6d2da4/1667459778293-be31b02b-7f6c-4c27-becc-2c0c8e80b538.gif)


| Property | Description                                                                 |
| :------- | :-------------------------------------------------------------------------- |
| Name     | The name of this layer.                                                     |
| Weight   | The blending weight of this layer, default value is 1.0.                    |
| Blending | The blending mode of this layer, `Additive` for additive mode, `Override` for override mode, default value is `Override`. |


#### Script Usage

To overlay an animation state onto another layer and set its blending mode to `AnimatorLayerBlendingMode.Additive` to achieve the additive animation effect,

<playground src="skeleton-animation-additive.ts"></playground>

### Default Playback

Connecting an AnimatorState to `entry` will automatically play its animation at runtime without the need to call `animator.play`. You will also see the model in the editor start playing the animation.
![2](https://gw.alipayobjects.com/zos/OasisHub/de60a906-0d3c-4578-8d50-aa2ce050e560/2.jpg)

#### Script Usage

You can set the default playback animation for a layer by setting the [defaultState](/apis/core/#AnimatorStateMachine-defaultState) of the AnimatorStateMachine. This way, when `Animator.enabled=true`, you do not need to call the `play` method to play the default animation.

```typescript
const layers = animator.animatorController.layers;
layers[0].stateMachine.defaultState = animator.findAnimatorState('walk');
layers[1].stateMachine.defaultState = animator.findAnimatorState('sad_pose');
layers[1].blendingMode = AnimatorLayerBlendingMode.Additive;
```

### Get Currently Playing Animator State

You can use the [getCurrentAnimatorState](/apis/core/#Animator-getCurrentAnimatorState) method to get the currently playing AnimatorState. The parameter is the index of the layer where the animation state is located, see [API documentation](/apis/core/#Animator-getCurrentAnimatorState) for details. After obtaining it, you can set properties of the animation state, such as changing the default loop playback to once.

```typescript
const currentState = animator.getCurrentAnimatorState(0);
// 播放一次
currentState.wrapMode = WrapMode.Once;
// 循环播放
currentState.wrapMode = WrapMode.Loop;
```

### Get Animator State

You can use the [findAnimatorState](/apis/core/#Animator-findAnimatorState) method to get the AnimatorState with a specified name. See [API documentation](/apis/core/#Animator-getCurrentAnimatorState) for details. After obtaining it, you can set properties of the animation state, such as changing the default loop playback to once.

```typescript
const state = animator.findAnimatorState('xxx');
// 播放一次
state.wrapMode = WrapMode.Once;
// 循环播放
state.wrapMode = WrapMode.Loop;
```

### State Machine Script

<playground src="animation-stateMachineScript.ts"></playground>

The state machine script provides users with lifecycle hook functions for animation states to write their own game logic code. Users can inherit the [StateMachineScript](/apis/core/#StateMachineScript) class to use the state machine script.

The state machine script provides three animation state cycles:

- `onStateEnter`: Callback when the animation state starts playing.
- `onStateUpdate`: Callback when the animation state updates.
- `onStateExit`: Callback when the animation state ends.

```typescript
class theScript extends StateMachineScript {
  // onStateEnter is called when a transition starts and the state machine starts to evaluate this state
  onStateEnter(animator: Animator, stateInfo: any, layerIndex: number) {
    console.log('onStateEnter', animator, stateInfo, layerIndex);
  }

  // onStateUpdate is called on each Update frame between onStateEnter and onStateExit callbacks
  onStateUpdate(animator: Animator, stateInfo: any, layerIndex: number) {
    console.log('onStateUpdate', animator, stateInfo, layerIndex);
  }

  // onStateExit is called when a transition ends and the state machine finishes evaluating this state
  onStateExit(animator: Animator, stateInfo: any, layerIndex: number) {
    console.log('onStateExit', animator, stateInfo, layerIndex);
  }
}

animatorState.addStateMachineScript(theScript)
```

If your script is not for reuse, you can also write it like this:

```typescript
state.addStateMachineScript(
  class extends StateMachineScript {
    onStateEnter(
      animator: Animator,
      animatorState: AnimatorState,
      layerIndex: number
    ): void {
      console.log("onStateEnter: ", animatorState);
    }
  }
);
```
