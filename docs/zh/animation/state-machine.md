---
order: 5
title: 动画状态机
type: 动画
label: Animation
---

### 动画过渡

将两个想要过渡的 `AnimatorState` 连接即可实现动画过渡的效果, 点击两个动画间的连线，可以修改动画过渡的参数调整效果

![animationcrossfade](https://gw.alipayobjects.com/zos/OasisHub/cd8fa035-0c1c-493e-a0c7-54d301f96156/1667458692286-29d9f543-9b98-4911-8fa7-ac38b61b1668.gif)

#### 参数说明

| 属性 | 功能说明 |
| :------- | :---------------------------------------------------------|
| duration | 过渡时长，时间为相对目标状态的归一化时间, 默认值为 1.0            |
| offset   | 目标状态向前的偏移时间，时间为相对目标状态的归一化时间, 默认值为 0  |
| exitTime | 起始状态过渡开始时间，时间为相对起始状态的归一化时间, 默认值为 0.3  |

#### 脚本使用

你可以通过为 `AnimatorState` 添加 `AnimatorTransition` 实现动画状态间的过渡。

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
通过这样的方式你之后每次在该动画状态机所在的层播放 `walk` 动画时都会在播放一半时开始过渡到 `run` 动画。

### 动画叠加

Galacean引擎支持多层的动画叠加。动画叠加是通过 `AnimatorControllerLayer` 间的混合达到的效果。第一层是基础动画层，修改它的权重及混合模式将不会生效。

双击 `AnimatorController` 资源文件编辑动画，添加 Layer，将混合的动作也连接`entry`

![animationadditive](https://gw.alipayobjects.com/zos/OasisHub/7548a66b-a72f-4cad-9b27-c9f1a2824aff/1667459461151-4568a32a-07db-427b-922e-3bc6f844097b.gif)

有的时候你想要得到一个固定的姿势，需要裁减设计师给到的动画切片，可以向上图一样修改 `AnimatorState` 的`StartTime` 及 `EndTime`，点击 `AnimatorState` 即可对其进行编辑:

![1](https://gw.alipayobjects.com/zos/OasisHub/cc0db4c9-95f9-48d7-a3ac-48d69e94a31d/1.jpg)

| 属性 | 功能说明 |
| :------- | :------------------------------------------------------------------- |
| Name          | 修改 `AnimatorState` 的名字，名字在所在的层要是**唯一**的。           |
| AnimationClip | 用于绑定 `AnimationClip` 资产，`AnimationClip` 存储了模型的动画数据。 |
| WrapMode      | `AnimatorState` 是循环播放还是播放一次，默认为 `Once` 即播放一次。     |
| Speed         | `AnimatorState` 的播放速度，默认值为 1.0 ，值越大动画速度越快          |
| StartTime     | `AnimatorState` 从 `AnimationClip` 的哪个时间开始播放，时间为相对 `AnimationClip` 时长的归一化时间。默认值为 0 ，即从头开始播放。 例如：值为 1.0 ，则是 `AnimationClip` 的最后一帧状态。        |
| EndTime       | `AnimatorState` 播放到 `AnimationClip` 的哪个时间结束播放，时间为相对 `AnimationClip` 时长的归一化时间。默认值为 1.0 ，即播放到最后。                                                      |

你也可以通过修改 `Layer` 的 `Weight` 参数来调整 `Layer` 在混合中的权重，通过修改 `Blending` 来修改混合模式。

![animationadditive2](https://gw.alipayobjects.com/zos/OasisHub/acd80bdf-7c8d-41ac-8a2f-fe75cc6d2da4/1667459778293-be31b02b-7f6c-4c27-becc-2c0c8e80b538.gif)

| 属性      | 功能说明                                                                    |
| :------- | :------------------------------------------------------------------------- |
| Name     | 该层的名字。                                                                 |
| Weight   | 该层的混合权重，默认值为 1.0 。                                                |
| Blending | 该层的混合模式，`Additive` 为叠加模式， `Override` 为覆盖模式，默认值为 `Override` |


#### 脚本使用

将想要叠加的动画状态添加到其他层并将它的混合模式设置为 `AnimatorLayerBlendingMode.Additive` 即可实现动画叠加效果，

<playground src="skeleton-animation-additive.ts"></playground>

### 默认播放

将 AnimatorState 连接到`entry`上你导出的项目运行时就会自动播放其上的动画，而不需再调用 `animator.play`。同时你也会看到编辑器的模型也开始播放动画了。
![2](https://gw.alipayobjects.com/zos/OasisHub/de60a906-0d3c-4578-8d50-aa2ce050e560/2.jpg)

#### 脚本使用

你可以通过设置AnimatorStateMachine的[defaultState](/apis/core/#AnimatorStateMachine-defaultState) 来设置所在层的默认播放动画，这样当Animator `enabled=true` 时你不需要调用 `play` 方法即可默认播放。

```typescript
const layers = animator.animatorController.layers;
layers[0].stateMachine.defaultState = animator.findAnimatorState('walk');
layers[1].stateMachine.defaultState = animator.findAnimatorState('sad_pose');
layers[1].blendingMode = AnimatorLayerBlendingMode.Additive;
```

### 获取当前在播放的动画状态

你可以使用 [getCurrentAnimatorState](/apis/core/#Animator-getCurrentAnimatorState) 方法来获取当前正在播放的AnimatorState。参数为动画状态所在层的序号`layerIndex`, 详见[API文档](/apis/core/#Animator-getCurrentAnimatorState)。获取之后可以设置动画状态的属性，比如将默认的循环播放改为一次。

```typescript
const currentState = animator.getCurrentAnimatorState(0);
// 播放一次
currentState.wrapMode = WrapMode.Once;
// 循环播放
currentState.wrapMode = WrapMode.Loop;
```

### 获取动画状态

你可以使用 [findAnimatorState](/apis/core/#Animator-findAnimatorState) 方法来获取指定名称的AnimatorState。详见[API文档](/apis/core/#Animator-getCurrentAnimatorState)。获取之后可以设置动画状态的属性，比如将默认的循环播放改为一次。

```typescript
const state = animator.findAnimatorState('xxx');
// 播放一次
state.wrapMode = WrapMode.Once;
// 循环播放
state.wrapMode = WrapMode.Loop;
```

### 状态机脚本

<playground src="animation-stateMachineScript.ts"></playground>

状态机脚本为用户提供了动画状态的生命周期钩子函数来编写自己的游戏逻辑代码。用户可以通过继承 [StateMachineScript](/apis/core/#StateMachineScript) 类来使用状态机脚本。

状态机脚本提供了三个动画状态周期：

- `onStateEnter`：动画状态开始播放时回调。
- `onStateUpdate`：动画状态更新时回调。
- `onStateExit`：动画状态结束时回调。

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

如果你的脚本不用复用的话你也可以这么写:

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