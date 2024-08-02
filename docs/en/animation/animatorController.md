---
order: 2
title: Animation Controller
type: Animation
label: Animation
---

The Animation Controller ([AnimatorController](/apis/core/#AnimatorController)) is used to organize [animation clips](/en/docs/animation/clip) ([AnimationClip](/apis/core/#AnimationClip)) to achieve more flexible and rich animation effects.

## Editor Usage

### Basic Usage

Through the editor of the animation controller, users can organize the playback logic of [animation clips](/en/docs/animation/clip}).

1. Prepare the animation clips ([Create animation clips](/en/docs/animation/clip}))

![1](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*Qc8sQ6iJd8IAAAAAAAAAAAAADsJ_AQ/original)

2. To organize the playback of these animation clips, we need to create an animation controller ([AnimatorController](/apis/core/#AnimatorController})) asset

![3](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*irT7SZvw4N8AAAAAAAAAAAAADsJ_AQ/original)

3. The newly created animation controller has no data, we need to edit it, double-click the asset, and add an AnimatorState to it

![5](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*BcYXSI6OTyoAAAAAAAAAAAAADsJ_AQ/original)

4. Click on AnimatorState to bind an animation clip to it

![6](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*KwFzRZCmbxoAAAAAAAAAAAAADsJ_AQ/original)

5. Bind this animation controller ([AnimatorController](/apis/core/#AnimatorController})) asset to the [animation control component](/en/docs/animation/animator})

![4](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*VtX3RJR8kdMAAAAAAAAAAAAADsJ_AQ/original)

6. Now you can play the `run` animation by `animator.play("New State")` in your exported project

You can achieve more functions through the editor of the animation controller:

### Default Play

Connect AnimatorState to `entry`, and the animation on it will automatically play when your exported project runs, without the need to call `animator.play`. At the same time, you will see the model in the editor also start playing the animation.

![2](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*t2JlQ7PGqikAAAAAAAAAAAAADsJ_AQ/original)

### Animation Transition

Connect two `AnimatorState` you want to transition between to achieve the effect of animation transition. Click on the line between the two animations to modify the parameters of the animation transition for adjustment.

![animationcrossfade](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*7_OFQqABtc0AAAAAAAAAAAAADsJ_AQ/original)

#### Parameter Description

| Property | Function Description                                                |
| :------- | :------------------------------------------------------------------- |
| duration | Transition duration, time is normalized time relative to the target state, default value is 1.0 |
| offset   | Forward offset time of the target state, time is normalized time relative to the target state, default value is 0 |
| exitTime | Start state transition start time, time is normalized time relative to the start state, default value is 0.3 |

### Animation Layering

The Galacean engine supports multi-layer animation layering. Animation layering is achieved through blending between `AnimatorControllerLayer`. The first layer is the base animation layer, modifying its weight and blending mode will not take effect.

Double-click the `AnimatorController` resource file to edit the animation, add a layer, and connect the blended actions to `entry`.


![animationadditive](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*vF7fS6mRnmYAAAAAAAAAAAAADsJ_AQ/original)

Sometimes you may want to achieve a fixed pose, you need to trim the animation slices provided by the designer, you can modify the `StartTime` and `EndTime` of `AnimatorState`, click on `AnimatorState` to edit it:

![1](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*JNFGTboEM5QAAAAAAAAAAAAADsJ_AQ/original)

| Property       | Description                                                                                                                                                                              |
| :------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name           | Modify the name of `AnimatorState`, the name should be **unique** in the layer it belongs to.                                                                                           |
| AnimationClip  | Used to bind the `AnimationClip` asset, `AnimationClip` stores the animation data of the model.                                                                                          |
| WrapMode       | Whether `AnimatorState` loops or plays once, default is `Once` which means play once.                                                                                                    |
| Speed          | The playback speed of `AnimatorState`, default value is 1.0, the larger the value, the faster the animation speed.                                                                       |
| StartTime      | Where `AnimatorState` starts playing from in the `AnimationClip`, time is normalized time relative to the duration of `AnimationClip`. Default is 0, starting from the beginning. For example, if the value is 1.0, it is the last frame state of `AnimationClip`. |
| EndTime        | Where `AnimatorState` stops playing in the `AnimationClip`, time is normalized time relative to the duration of `AnimationClip`. Default is 1.0, playing until the end.                                                                               |

You can also adjust the weight of the `Layer` in the blend by modifying the `Weight` parameter of the `Layer`, and modify the blending mode by changing the `Blending`.

![animationadditive2](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*_3aNSKP44FgAAAAAAAAAAAAADsJ_AQ/original)

| Property  | Description                                                                 |
| :-------- | :-------------------------------------------------------------------------- |
| Name      | The name of this layer.                                                    |
| Weight    | The blend weight of this layer, default value is 1.0.                     |
| Blending  | The blending mode of this layer, `Additive` for additive mode, `Override` for override mode, default is `Override`. |

## Script Usage

> Before using the script, it is recommended to read the [Animation System Composition](/en/docs/animation/system/) documentation to help you better understand the operation logic of the animation system.

### Default Playback

You can set the default playback animation for the layer by setting the [defaultState](/apis/core/#AnimatorStateMachine-defaultState) of the AnimatorStateMachine. This way, when Animator `enabled=true`, you do not need to call the `play` method to play the default animation.

```typescript
const layers = animator.animatorController.layers;
layers[0].stateMachine.defaultState = animator.findAnimatorState("walk");
layers[1].stateMachine.defaultState = animator.findAnimatorState("sad_pose");
layers[1].blendingMode = AnimatorLayerBlendingMode.Additive;
```

### Animation Transition

You can implement transitions between animation states by adding `AnimatorTransition` to `AnimatorState`.

```typescript
const walkThenRunState = animatorStateMachine.addState("walkThenRun");
walkThenRunState.clip = walkClip;
const runState = animatorStateMachine.addState("run");
runState.clip = runClip;
const transition = new AnimatorStateTransition();
transition.duration = 1;
transition.offset = 0;
transition.exitTime = 0.5;
transition.destinationState = runState;
walkThenRunState.addTransition(transition);
animator.play("walkThenRun");
```

By doing this, every time you play the `walkThenRun` animation in the layer of the animation state machine, it will transition from the `walk` animation to the `run` animation halfway through the `walk` animation.

### Animation Overlay

To overlay animations, add the desired animation state to another layer and set its blending mode to `AnimatorLayerBlendingMode.Additive` to achieve the animation overlay effect.

<playground src="skeleton-animation-additive.ts"></playground>

### Animation Data

#### Setting Animation Data

You can set the animation data of the animator controller using the [animatorController](/apis/core/#Animator-animatorController) property. A default AnimatorController will be automatically added when a GLTF model is loaded.

```typescript
animator.animatorController = new AnimatorController(engine);
```

#### Reusing Animation Data

Sometimes the animation data of a model is stored in another model, and you can import and use it as follows:

<playground src="skeleton-animation-reuse.ts"></playground>

In addition, the [AnimatorController](/apis/core/#AnimatorController) of the Animator is a class for storing data and does not contain runtime data. Based on this design, as long as the hierarchical structure and naming of the **skeleton nodes** of the model bound to the Animator component are the same, we can reuse the animation data.

```typescript
const animator = model1.getComponent(Animator);
animator.animatorController = model2.getComponent(Animator).animatorController;
```

### State Machine Script

<playground src="animation-stateMachineScript.ts"></playground>

The state machine script provides users with lifecycle hook functions for animation states to write their own game logic code. Users can use the state machine script by inheriting from the [StateMachineScript](/apis/core/#StateMachineScript) class.

The state machine script provides three animation state cycles:

- `onStateEnter`: Callback when the animation state starts playing.
- `onStateUpdate`: Callback when the animation state is updated.
- `onStateExit`: Callback when the animation state ends.

```typescript
class theScript extends StateMachineScript {
  // onStateEnter is called when a transition starts and the state machine starts to evaluate this state
  onStateEnter(animator: Animator, stateInfo: any, layerIndex: number) {
    console.log("onStateEnter", animator, stateInfo, layerIndex);
  }

  // onStateUpdate is called on each Update frame between onStateEnter and onStateExit callbacks
  onStateUpdate(animator: Animator, stateInfo: any, layerIndex: number) {
    console.log("onStateUpdate", animator, stateInfo, layerIndex);
  }

  // onStateExit is called when a transition ends and the state machine finishes evaluating this state
  onStateExit(animator: Animator, stateInfo: any, layerIndex: number) {
    console.log("onStateExit", animator, stateInfo, layerIndex);
  }
}

animatorState.addStateMachineScript(theScript);
```

If your script does not need to be reused, you can also write it like this:

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
