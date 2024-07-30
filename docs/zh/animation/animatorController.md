---
order: 2
title: 动画控制器
type: 动画
label: Animation
---

动画控制器（[AnimatorController](/apis/core/#AnimatorController)）用于组织[动画片段](/docs/animation-clip)（[AnimationClip](/apis/core/#AnimationClip)）实现更加灵活丰富的动画效果。

## 编辑器使用

### 基础使用

通过动画控制器的编辑器，用户可以在其中组织[动画片段](/docs/animation-clip)的播放逻辑

1. 准备好动画片段（[制作动画片段](/docs/animation-clip)）

![1](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*Qc8sQ6iJd8IAAAAAAAAAAAAADsJ_AQ/original)

2. 要组织播放这些动画片段我们需要创建一个动画控制器（[AnimatorController](/apis/core/#AnimatorController)）资产

![3](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*irT7SZvw4N8AAAAAAAAAAAAADsJ_AQ/original)

3. 刚创建的动画控制器中没有任何数据，我们需要对他进行编辑，双击资产, 并为它添加一个 AnimatorState

![5](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*BcYXSI6OTyoAAAAAAAAAAAAADsJ_AQ/original)

4. 点击 AnimatorState 为它绑定一个动画片段

![6](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*KwFzRZCmbxoAAAAAAAAAAAAADsJ_AQ/original)

5. 在[动画控制组件](/docs/animation-animator)上绑定该动画控制器（[AnimatorController](/apis/core/#AnimatorController)）资产

![4](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*VtX3RJR8kdMAAAAAAAAAAAAADsJ_AQ/original)

6. 至此你在导出的项目中就可以通过 `animator.play("New State")` 播放 `run` 动画了

你还可以通过动画控制器的编辑器实现更多的功能：

### 默认播放

将 AnimatorState 连接到`entry`上你导出的项目运行时就会自动播放其上的动画，而不需再调用 `animator.play`。同时你也会看到编辑器的模型也开始播放动画了。
![2](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*t2JlQ7PGqikAAAAAAAAAAAAADsJ_AQ/original)

### 动画过渡

将两个想要过渡的 `AnimatorState` 连接即可实现动画过渡的效果, 点击两个动画间的连线，可以修改动画过渡的参数调整效果

![animationcrossfade](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*7_OFQqABtc0AAAAAAAAAAAAADsJ_AQ/original)

#### 参数说明

| 属性     | 功能说明                                                           |
| :------- | :----------------------------------------------------------------- |
| duration | 过渡时长，时间为相对目标状态的归一化时间, 默认值为 1.0             |
| offset   | 目标状态向前的偏移时间，时间为相对目标状态的归一化时间, 默认值为 0 |
| exitTime | 起始状态过渡开始时间，时间为相对起始状态的归一化时间, 默认值为 0.3 |

### 动画叠加

Galacean 引擎支持多层的动画叠加。动画叠加是通过 `AnimatorControllerLayer` 间的混合达到的效果。第一层是基础动画层，修改它的权重及混合模式将不会生效。

双击 `AnimatorController` 资源文件编辑动画，添加 Layer，将混合的动作也连接`entry`

![animationadditive](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*vF7fS6mRnmYAAAAAAAAAAAAADsJ_AQ/original)

有的时候你想要得到一个固定的姿势，需要裁减设计师给到的动画切片，可以修改 `AnimatorState` 的`StartTime` 及 `EndTime`，点击 `AnimatorState` 即可对其进行编辑:

![1](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*JNFGTboEM5QAAAAAAAAAAAAADsJ_AQ/original)

| 属性          | 功能说明                                                                                                                                                                                 |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name          | 修改 `AnimatorState` 的名字，名字在所在的层要是**唯一**的。                                                                                                                              |
| AnimationClip | 用于绑定 `AnimationClip` 资产，`AnimationClip` 存储了模型的动画数据。                                                                                                                    |
| WrapMode      | `AnimatorState` 是循环播放还是播放一次，默认为 `Once` 即播放一次。                                                                                                                       |
| Speed         | `AnimatorState` 的播放速度，默认值为 1.0 ，值越大动画速度越快                                                                                                                            |
| StartTime     | `AnimatorState` 从 `AnimationClip` 的哪个时间开始播放，时间为相对 `AnimationClip` 时长的归一化时间。默认值为 0 ，即从头开始播放。 例如：值为 1.0 ，则是 `AnimationClip` 的最后一帧状态。 |
| EndTime       | `AnimatorState` 播放到 `AnimationClip` 的哪个时间结束播放，时间为相对 `AnimationClip` 时长的归一化时间。默认值为 1.0 ，即播放到最后。                                                    |

你也可以通过修改 `Layer` 的 `Weight` 参数来调整 `Layer` 在混合中的权重，通过修改 `Blending` 来修改混合模式。

![animationadditive2](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*_3aNSKP44FgAAAAAAAAAAAAADsJ_AQ/original)

| 属性     | 功能说明                                                                           |
| :------- | :--------------------------------------------------------------------------------- |
| Name     | 该层的名字。                                                                       |
| Weight   | 该层的混合权重，默认值为 1.0 。                                                    |
| Blending | 该层的混合模式，`Additive` 为叠加模式， `Override` 为覆盖模式，默认值为 `Override` |

## 脚本使用

> 在使用脚本之前，最好阅读[动画系统构成](/docs/animation-system)文档，以帮助你更好的了解动画系统的运行逻辑

### 默认播放

你可以通过设置 AnimatorStateMachine 的[defaultState](/apis/core/#AnimatorStateMachine-defaultState) 来设置所在层的默认播放动画，这样当 Animator `enabled=true` 时你不需要调用 `play` 方法即可默认播放。

```typescript
const layers = animator.animatorController.layers;
layers[0].stateMachine.defaultState = animator.findAnimatorState("walk");
layers[1].stateMachine.defaultState = animator.findAnimatorState("sad_pose");
layers[1].blendingMode = AnimatorLayerBlendingMode.Additive;
```

### 动画过渡

你可以通过为 `AnimatorState` 添加 `AnimatorTransition` 实现动画状态间的过渡。

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

通过这样的方式你之后每次在该动画状态机所在的层播放 `walkThenRun` 动画时都会在 `walk` 动画播放一半时开始过渡到 `run` 动画。

### 动画叠加

将想要叠加的动画状态添加到其他层并将它的混合模式设置为 `AnimatorLayerBlendingMode.Additive` 即可实现动画叠加效果，

<playground src="skeleton-animation-additive.ts"></playground>

### 动画数据

#### 设置动画数据

你可以通过 [animatorController](/apis/core/#Animator-animatorController)  属性来设置动画控制器的动画数据，加载完成的 GLTF 模型会自动添加一个默认的 AnimatorController。

```typescript
animator.animatorController = new AnimatorController(engine)；
```

#### 复用动画数据

有的时候模型的动画数据存储在其他模型中，可以用如下的方式引入使用：

<playground src="skeleton-animation-reuse.ts"></playground>

除此以外还有一种方式，Animator 的 [AnimatorController](/apis/core/#AnimatorController) 就是一个数据存储的类，它不会包含运行时的数据，基于这种设计只要绑定 Animator 组件的模型的**骨骼节点的层级结构和命名相同**，我们就可以对动画数据进行复用。

```typescript
const animator = model1.getComponent(Animator);
animator.animatorController = model2.getComponent(Animator).animatorController;
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
