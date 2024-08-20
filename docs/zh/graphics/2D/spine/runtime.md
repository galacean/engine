---
order: 2
title: 在代码中使用
type: 图形
group: Spine
label: Graphics/2D/Spine/runtime
---

本章节为大家介绍如何在代码中使用 Galacean Spine 运行时。


## 安装
无论是通过编辑器导出的项目，或者 procode 项目，都需要通过安装 @galacean/engine-spine (即Galacean Spine 运行时) 来实现 Spine 动画的加载与渲染。
```typescript
npm install @galacean/engine-spine --save
```
安装成功后，需要在代码中引入
```typescript
import { SpineAnimationRenderer } from "@galacean/engine-spine";
```
安装并导入 `@galacean/engine-spine` 后，编辑器的 resourceManager 才能识别并加载 Spine 动画资产。
Galacean spine 加载器既能加载编辑器上传的资产，也能过加载自定义上传的资产。

## 加载资产并添加至场景

### 加载 Galacean 编辑器中的上传的资产
[导出编辑器项目后](/docs/assets/build/)，`已添加至场景中的 Spine 动画，会在加载场景文件时，自动完成加载`：

```typescript
// 加载场景文件时，已添加至场景中的 Spine 动画会自行完成加载
await engine.resourceManager.load({
  url: projectInfo.url,
  type: AssetType.Project,
})
```

<b>若未添加至场景中，则需要在代码中手动加载</b>，步骤如下：
1. 首先，需要找到 Spine 动画的资产链接，点击 Galacean 编辑器的下载按钮，选择 project URL，拷贝 project.json 后打开，找到上传的 spine 动画文件（skel / json）：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721297144951-6dafb4e3-ccfa-495e-a540-8b3918b66400.png#clientId=u4b0ad8a6-bdc5-4&from=paste&height=480&id=u8ed78f33&originHeight=533&originWidth=359&originalType=binary&ratio=1&rotation=0&showTitle=false&size=40311&status=done&style=none&taskId=udf9587bf-1818-470f-a108-8ca0d7fe9d0&title=&width=323" width="330" alt="Project export panel">

找到 spine 资产文件 json 或 skel：
<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721297264288-7e493fa1-c6dd-4ebe-b674-832e1a566ab4.png#clientId=u19967f75-5563-4&from=paste&height=186&id=u30ef79e4&originHeight=186&originWidth=934&originalType=binary&ratio=1&rotation=0&showTitle=false&size=40438&status=done&style=shadow&taskId=u2fdda912-fec4-4c80-8de7-c96233bedd1&title=&width=934" width="934" alt="Spine skeleton data file">

2. 使用 resourceManager 加载

得到 spine 的骨骼文件资产链接后，需要使用 resourceManager 进行加载。手动加载时，添加 Spine 至场景中，需要创建一个新的实体并添加 SpineAnimationRenderer 组件，代码如下：
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

// 加载并得到 spine 资源
const spineResource = await engine.resourceManager.load(
  {
    url: 'https://galacean.spineboy.json', // 编辑器资产
    type: 'spine', // 必须指定加载器类型为 spine
  },
);
// 创建一个新的实体
const spineEntity = new Entity(engine);
// 添加 SpineAnimationRenderer 组件
const spine = spineEntity.addComponent(SpineAnimationRenderer);
// 设置动画资源
spine.resource = spineResource;
// 添加至场景
root.addChild(spineEntity);
```
### 加载自定义上传的资产
1. 加载资产

如果你的 Spine 资产未通过 Galacean 编辑器进行上传，而是通过三方平台上传至 CDN，同样能够通过 Galacean Spine 运行时加载器进行加载。
```typescript
const resource = await engine.resourceManager.load(
  {
    url: 'https://your.spineboy.json', // 自定义上传的资产
    type: 'spine', // 必须指定加载器类型为 spine
  },
);
```
加载自定义上传的资产时：
- 当传递参数为 url 时，`需要保证 atlas 和 texture 资源与骨骼文件在相同目录下`，即：<br>
https://your.spineboy.json <br>
https://your.spineboy.atlas <br>
https://your.spineboy.png <br>
三个文件相同目录

- 当传递参数为 urls (多链接)时，则无需满足相同目录的条件：
```typescript
const resource = await engine.resourceManager.load(
  {
    urls: [
      'https://your.spineboy.json',
      'https://ahother-path1.spineboy.altas',
      'https://ahother-path2.spineboy.png',
    ], // 自定义上传的资产
    type: 'spine',// 必须指定加载器类型为 spine
  },
);
```
- 若不传递 texture 地址，那么加载器会从 atlas 文件中读取 texture 的图片名称，并从 atlas 文件的相对路径下查找 texture 资源。<br>
- 若自定上传的资产没有文件后缀（比如 blob 协议的 URL），则可以通过给链接添加 URL query 参数，例如：<br>
https://your.spineboyjson?ext=.json<br>
https://your.spineboyatlas?ext=.atlas <br>
或者添加 fileExtensions 参数来指定资源后缀类型：
```typescript
const resource = await engine.resourceManager.load(
  {
    urls: [
      'https://your.spineboyjson',
      'https://ahother-path1.spineboyatlas',
      'https://ahother-path2.spineboypng',
    ], // 自定义上传的资产
    type: 'spine',
    fileExtensions: [
      'json', // 指定第一个文件为 json 后缀
      'atlas', // 指定第二个文件为 atlas 后缀
      'png', // // 指定第三个文件为 atlas 后缀
    ]
  },
);
```
- 若 Spine 动画的 texure atlas 包含多张图片，则需要按照 atlas 文件中图片的顺序传入图片地址。

2. 添加至场景

加载完毕后，需要手动创建实体，并添加 SpineAnimationRenderer 组件：
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

const spineResource = await engine.resourceManager.load(
  {
    url: 'https://your.spineboy.json', // 自定义上传的资产
    type: 'spine',
  },
);
// 创建实体
const spineEntity = new Entity(engine);
// 添加 SpineAnimationRenderer 组件
const spine = spineEntity.addComponent(SpineAnimationRenderer);
// 设置动画资源
spine.resource = spineResource;
// 添加至场景
root.addChild(spineEntity);
```


## 使用运行时 API 

在[前一个章节](/docs/graphics/2D/spine/editor)中，为大家介绍了编辑器中 SpineAnimationRenderer 组件的配置项。
本小节会更加详细介绍在代码中如何使用 SpineAnimationRenderer 组件的各个 API。

SpineAnimationRenderer 组件继承于 Renderer，除了暴露 Renderer 的通用方法外，还提供了以下属性：

| 属性                                                                                         | 解释                   | 
| :--------------------------------------------------------------------------------------------- | :--------------------- |
| resource                             | Spine 动画资源。设置了资源后，SpineAnimationRenderer 组件会读取资源数据，并渲染出 Spine 动画 | 
| setting   | 渲染设置。用于控制开启裁减和调整图层间隔         |
| defaultState | 默认状态。与编辑器的配置项对应，用于设置默认状态下 Spine 动画的动画，皮肤，缩放         | 
| state                 | 动画状态对象。用于进行更加复杂动画控制，如：队列播放，循环控制等         |
| skeleton                 | 骨架对象。用于进行更加复杂的骨架操作，如：附件替换，换肤等        |

下面是更详细的使用介绍：

### 资源设置
首先是资源的设置。SpineAnimationRenderer 组件需要设置资源后，才能完成 Spine动画的渲染。在上一个章节，「加载资产并添加至场景」中，已经为大家展示了设置资产的方式：
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

const spineResource = await engine.resourceManager.load(
  {
    url: 'https://your.spineboy.json',
    type: 'spine',
  },
);
const spineEntity = new Entity(engine);
const spine = spineEntity.addComponent(SpineAnimationRenderer);
spine.resource = spineResource; // 设置 Spine 资产
root.addChild(spineEntity);
```

### 渲染设置
在脚本中，你可以通过以下方式修改 Spine 的渲染设置，一般情况下，使用默认值即可。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    spine.setting.zSpacing = 0.01; // 设置图层间隔
    spine.setting.useClipping = true; // 开启或关闭裁减，默认开启
  }

}
``` 

### 默认状态
在脚本中，你可以通过以下方式修改 Spine 动画的默认状态:
```typescript
class YourAmazingScript {

  onStart() {
    const spineResource = await engine.resourceManager.load(
      {
        url: 'https://your.spineboy.json',
        type: 'spine',
      },
    );
    const spineEntity = new Entity(engine);
    const spine = spineEntity.addComponent(SpineAnimationRenderer);
    spine.defaultState.animationName = 'your-default-animation-name'; // 默认播放的动画名称
    spine.defaultState.loop = true; // 默认播放的动画是否循环
    spine.defaultState.skinName = 'default'; // 默认皮肤名称
    spine.defaultState.scale = 0.02; // 默认缩放
    spine.resource = spineResource; // 设置资源
    rootEntity.addChild(spineEntity); // 添加至场景，此时组件激活
  }

}
``` 
注意：默认状态仅在 SpineAnimationRenderer 组件激活和资源设置时生效。动态修改动画、皮肤、缩放请使用 state 与 skeleton 属性中的方法（见下面的章节）。


### 动画控制
在脚本中，你能够通过以下方式获取到 [AnimationState](https://zh.esotericsoftware.com/spine-api-reference#AnimationState) 对象，使用 AnimationState 对象能够实现更加复杂的动画操作。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState 对象
  }
  
}
```
#### **播放动画**
首先，我们来介绍一下最常用的 API：[setAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-setAnimation)
```typescript
state.setAnimation(0, 'animationName', true)
```
setAnimation 函数接受三个参数：

- TrackIndex：动画轨道序号
- animationName：动画名称
- loop：是否循环播放

后两个参数很好理解，第一个参数则包含了 Spine 动画的一个概念：**Track** （轨道）
> Spine 动画在播放时，需要指定一个动画轨道。借助动画轨道，Spine 能够分层应用动画，每一个轨道都能够存储动画与播放参数，轨道的编号从 0 开始累加。在动画应用后，Spine 会从低轨道到高轨道依次应用动画，高轨道上的动画将会覆盖低轨道上的动画。<br>
动画轨道有很多用途，例如，轨道 0 可以有行走、奔跑、游泳或其他动画，轨道 1 可以有一个只为手臂和开枪设置了关键帧的射击动画。此外，为高层轨道设置TrackEntry alpha可使其与下面的轨道混合。例如，轨道 0 可以有一个行走动画，轨道 1 可以有一个跛行动画。当玩家受伤时，增加轨道 1 的alpha值，跛行就会加重。


#### **设置过渡**
调用 setAnimation 方法后，会立即切换当前轨道的动画。如果你需要动画切换时有过渡效果，需要设置过渡的持续时间。可以通过 [AnimationStateData](https://zh.esotericsoftware.com/spine-api-reference#AnimationStateData) 的 API 来进行设置：
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState 对象
    const { data } = state; // AnimationStateData 对象
    data.defaultMix = 0.2; // 设置默认过渡持续时间
    data.setMix('animationA', 'animationB', 0.3); // 设置两个指定动画的过渡持续时间
  }
  
}
```

- defaultMix 是当两个动画间没有定义混合持续时间时的默认持续时间
- setMix 函数接受三个参数，前两个是需要设置过渡时间的动画名称，第三个则是动画混合的持续时间
#### **动画队列**
Spine 还提供了 [addAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addAnimation2) 方法来实现动画的队列播放：
```typescript
state.setAnimation(0, 'animationA', false); // 在轨道 0 播放动画 A
state.addAnimation(0, 'animationB', true, 0); // 在动画 A 之后后，添加动画 B，并循环播放
```
addAnimation 接受 4 个参数：

- TrackIndex：动画轨道
- animationName：动画名称
- loop：是否循环播放
- delay：延迟时间

前三个参数很好理解，这里解释一下第四个参数：
delay 代表了前一个动画的持续时间。
当 delay > 0 时（假设 delay 为 1），前一个动画会在播放 1 秒后，切换到下一个动画。如下图所示：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721274299254-431c2e96-9c3b-482e-a06b-350023042200.png#clientId=uf07edf19-371c-4&from=paste&height=129&id=u189d34f4&originHeight=348&originWidth=1286&originalType=binary&ratio=2&rotation=0&showTitle=false&size=92765&status=done&style=none&taskId=u329862b0-6b18-42b7-b7f2-4a5c118842d&title=&width=477" width="377" alt="animation delay > 0">

如果动画 A 的时长小于 1 秒，则会根据是否设置了循环播放：循环播放直至 1 秒，或者播放完毕后，保持在动画播放完毕的状态直至 1 秒。
当 delay = 0 时，下一个动画会在前一个动画播放完毕后播放，如下图所示：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721274614500-0cde58d2-ebb8-4d07-bf3a-5defb2278733.png#clientId=uf07edf19-371c-4&from=paste&height=168&id=uf2d2deb7&originHeight=476&originWidth=1324&originalType=binary&ratio=2&rotation=0&showTitle=false&size=118555&status=done&style=none&taskId=u1ec109a1-934a-4620-9d40-4d6c5987e6d&title=&width=467" width="377" alt="animation delay = 0">

假设动画 A 的时长为 1 秒，过渡持续时间为 0.2 秒，当 delay 设置为 0 时，动画 B 会从 1 - 0.2 也就是 0.8 秒开始过渡到动画 B。
当 delay < 0 时，上一个动画未播放完毕前，下一个动画就会开始播放，如下图所示：
同样假设动画 A 的时长为 1 秒，过渡持续时间为 0.2 秒，动画 B 则会从 0.6 秒开始过渡到动画 B。

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721281456701-391d3d2d-d4f4-42df-9947-43aca9e191ca.png#clientId=uf07edf19-371c-4&from=paste&height=189&id=u3e7c7104&originHeight=496&originWidth=1218&originalType=binary&ratio=2&rotation=0&showTitle=false&size=128314&status=done&style=none&taskId=u924e3b93-e550-4b9a-88d6-dc168361331&title=&width=464" width="377" alt="animation delay < 0">

除了 addAnimation 外，还能够通过 addEmptyAnimation 方法添加空动画。空动画能够让动画回到初始状态。

addEmptyAnimation 接受三个参数：TrackIndex，mixDuration 和 delay。TrackIndex 和 delay 参数与 addAnimation 一样。 mixDuration 是过渡持续时间，动画会在 mixDuration 时间内逐渐回到初始状态。如下图所示（右侧棕色区域即是空动画），

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721283804385-16d67f51-f1ae-48e5-94c5-7e1a9791b2dc.png#clientId=uf07edf19-371c-4&from=paste&height=138&id=u06ecf378&originHeight=516&originWidth=1000&originalType=binary&ratio=2&rotation=0&showTitle=false&size=126222&status=done&style=none&taskId=u1e6ba48f-dd00-49b1-83e2-3566d25f500&title=&width=267" width="267" alt="Add empty animation api">

#### **轨道参数**
setAnimation 和 addAnimation 方法都会返回一个对象：TrackEntry。TrackEntry 提供了更多的参数来进行动画控制。
例如：

- timeScale：控制动画播放的速度
- animationStart：控制动画播放的开始时间
- apha：当前动画应用轨道的混合系数
- ...

更多参数可以参考 [TrackEntry 官方文档](https://zh.esotericsoftware.com/spine-api-reference#TrackEntry)
#### **动画事件**

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721284098876-d94511d5-d69a-4754-80ef-4f9686cd17a2.png#clientId=uf07edf19-371c-4&from=paste&height=251&id=uf1167cf1&originHeight=280&originWidth=760&originalType=binary&ratio=2&rotation=0&showTitle=false&size=19012&status=done&style=none&taskId=u00edc2c8-9810-44ad-9254-34d8aa2d258&title=&width=681" width="681" alt="Animation event diagram">

当调用 AnimationState API 进行动画控制时，会触发如上图所示的事件。
在新的动画开始播放时，会触发 Start 事件，当动画在动画队列中移除或者中断时，会触发 End 事件。当动画播放完毕时，无论是否循环，都会触发 Complete 事件。

全部的事件以及详细解释请参考：[Spine 动画事件官方文档](https://zh.esotericsoftware.com/spine-unity-events)

这些事件能够通过 [AnimationState.addListener](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addListener) 进行监听。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState 对象
    state.addListener({
      start: (entry: TrackEntry) => {
        // call back function
      },
      complete: (entry: TrackEntry) => {
        // call back function
      },
      end: (entry: TrackEntry) => {
        // call back function
      },
      interrupt: (entry: TrackEntry) => {
        // call back function
      },
      dispose: (entry: TrackEntry) => {
        // call back function
      },
      event: (entry: TrackEntry) => {
        // call back function
      },
    })
  }
  
}
```

### 骨架操作
在脚本中，你能够通过以下方式获取到 [Skeleton](https://zh.esotericsoftware.com/spine-api-reference#Skeleton) 对象，来访问骨骼、插槽、附件等，并进行骨架操作。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton 对象
  }
  
}
```
下面是一些常用的操作：
#### **修改骨骼位置**
通过 Skeleton API 能够修改 Spine 骨骼的位置，比较常见的应用是：可以通过设置 IK 的目标骨骼，来实现瞄准/跟随效果。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton 对象
    const bone = skeleton.findBone('aim-target');
    bone.x = targetX;
    bone.y = targetY;
  }
  
}
```
注意：由于应用动画会修改骨骼位置，所以如果 Spine 在播放动画， 那么骨骼位置的修改需要在应用动画之后，也就是在脚本的 onLateUpdate 生命周期中进行操作。

#### **附件更换**
通过 Skeleton API 能够替换[插槽](https://zh.esotericsoftware.com/spine-slots)内的[附件](https://zh.esotericsoftware.com/spine-attachments)。通过切换附件，能够实现局部换装的效果。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton 对象
    // 根据名称查找插槽
    const slot = skeleton.findSlot('slotName');
    // 按名称从骨架皮肤或默认皮肤获取附件
    const attachment = skeleton.getAttachment(slot.index, 'attachmentName');
    // 设置插槽附件
    slot.attachment = attachment;
    // 或者由骨架setAttachment方法来设置插槽附件
    skeleton.setAttachment('slotName', 'attachmentName');
  }
}
```
注意：由于应用动画会修改插槽内的附件，所以如果 Spine 在播放动画，那么附件更换的操作需要在应用动画之后，也就是在脚本的 onLateUpdate 生命周期中进行操作。
#### **换肤与混搭**
**换肤**

通过 Skeleton 的 [setSkin](https://zh.esotericsoftware.com/spine-api-reference#Skeleton-setSkin) API 能够根据皮肤名称实现整体换肤。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton 对象
    // 根据皮肤名称设置皮肤
    skeleton.setSkinByName("full-skins/girl");
    // 回到初始位置（必须调用，否则渲染可能出现错乱）
    skeleton.setSlotsToSetupPose();
  }

}
```
**混搭**

在 Spine 编辑器中，设计师可以为每一个外观和装备准备皮肤，然后在运行时把他们组合成一个新的皮肤。下面的代码展示了如果通过 addSkin 来添加选定的皮肤的：
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton 对象
    const mixAndMatchSkin = new spine.Skin("custom-girl");
    mixAndMatchSkin.addSkin(skeletonData.findSkin("skin-base"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("nose/short"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("eyelids/girly"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("eyes/violet"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("hair/brown"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("clothes/hoodie-orange"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("legs/pants-jeans"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("accessories/bag"));
    mixAndMatchSkin.addSkin(skeletonData.findSkin("accessories/hat-red-yellow"));
    this.skeleton.setSkin(mixAndMatchSkin);
  }

}
```
代码中皮肤的名称来自 mix-and-match 示例。

下一个章节会给大家展示全部的 [Spine 示例](/docs/graphics/2D/spine/example)