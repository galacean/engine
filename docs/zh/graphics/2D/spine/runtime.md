---
order: 2
title: 在代码中使用
type: 图形
group: Spine
label: Graphics/2D/Spine/runtime
---

本章节为大家介绍如何在代码中使用 Galacean Spine


## 安装
无论是通过编辑器导出的项目，或者 procode 项目，都需要通过安装 @galacean/engine-spine (即Galacean Spine 运行时) 来实现 Spine 动画的加载与渲染。
```typescript
npm install @galacean/engine-spine --save
```
安装成功后，需要在代码中引入
```typescript
import { SpineAnimationRenderer } from "@galacean/engine-spine";
```
安装并导入 `@galacean/engine-spine` 后，编辑器的 `ResourceManager` 才能识别并加载 Spine 动画资产。


## 加载资产并添加至场景

### 加载编辑器中的上传的资产

```typescript
// 加载场景文件时，已添加至场景中的 Spine 动画会自行完成加载
await engine.resourceManager.load({
  url: projectInfo.url,
  type: AssetType.Project,
})
```

<b>若未添加至场景中，则需要在代码中手动加载</b>，步骤如下：
1. 拷贝 SkeletonDataAsset 资产链接
右键点击 SkeletonDataAsset 资产，点选 `Copy relative path` 拷贝资产路径
<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*muomS5hICRYAAAAAAAAAAAAADsp6AQ/original" />


2. 使用 ResourceManager 加载

得到资产路径后，需要使用 resourceManager 进行加载，代码如下：
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

// 加载并得到 spine 资源
const spineResource = await engine.resourceManager.load(
  {
    url: '/raptor.json', // 拷贝得到的相对路径
    type: 'Spine', // 指定加载器类型为 Spine
  },
);
// 实例化一个 Spine 动画实体
const spineEntity = spineResource.instantiate();
// 添加至场景
root.addChild(spineEntity);
```
### 加载自定义上传的资产
#### 1. 加载资产

如果你的 Spine 资产未通过 Galacean 编辑器进行上传，而是通过三方平台上传至 CDN，同样能够通过 Galacean Spine 运行时加载器进行加载。
```typescript
const resource = await engine.resourceManager.load(
  {
    url: 'https://your.spineboy.json', // 自定义上传的资产
    type: 'pine', // 指定加载器类型为 Spine
  },
);
```
加载自定义上传的资产时：
- 当传递参数为 url 时，<b>需要保证文件在相同目录下</b>，即：<br>
https://your.spineboy.json <br>
https://your.spineboy.atlas <br>
https://your.spineboy.png <br>


- 当传递参数为 urls (多链接)时，则无需满足相同目录的条件：
```typescript
const resource = await engine.resourceManager.load(
  {
    urls: [
      'https://your.spineboy.json',
      'https://ahother-path1.spineboy.altas',
      'https://ahother-path2.spineboy.png',
    ],
    type: 'Spine',// 指定加载器类型为 Spine
  },
);
```

- 若不传递 texture 地址，那么加载器会从 atlas 文件中读取 texture 的图片名称，并从 atlas 文件的目录下查找 texture 资源。<br>
- 若自定上传的资产没有文件后缀，可以通过给链接添加 URL query 参数，例如：<br>
https://your.spineboyjson?ext=.json,
https://your.spineboyatlas?ext=.atlas <br>

- 如果 Spine 动画的 atlas 包含多张图片（如 a.png 和 b.png），则需要按照 atlas 文件中记录的图片顺序传入图片地址:
```typescript
const resource = await engine.resourceManager.load(
  {
    urls: [
      'https://your.spineboy.json',
      'https://your.spineboy.atlas',
      'https://your.spineboy1.png', // 对应 a.png
      'https://your.spineboy2.png' // 对应 b.png
    ],
    type: 'Spine',// 指定加载器类型为 Spine
  },
);
```

#### 2. 添加至场景

加载完毕后， 实例化一个 Spine 动画实体并添加至场景：
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

const spineResource = await engine.resourceManager.load(
  {
    url: 'https://your.spineboy.json', // 自定义上传的资产
    type: 'Spine',
  },
);
// 实例化一个 Spine 动画实体
const spineEntity = spineResource.instantiate();
// 添加至场景
root.addChild(spineEntity);
```


## 更多运行时 API 

在[前一个章节](/docs/graphics/2D/spine/editor)中，为大家介绍了编辑器中 SpineAnimationRenderer 组件的配置项。
本小节会更加详细介绍在代码中如何使用 SpineAnimationRenderer 组件的各个 API。

SpineAnimationRenderer 组件继承于 Renderer，除了暴露 Renderer 的通用方法外，还提供了以下属性：

| 属性            | 解释                                                                                               |
| :------------- | :------------------------------------------------------------------------------------------------- |
| defaultConfig  | 默认配置。与编辑器的配置项对应，用于设置默认状态下 Spine 的动画和皮肤                        |
| state          | 动画状态对象。用于进行更加复杂的动画控制，例如：队列播放、循环控制等                                |
| skeleton       | 骨架对象。用于进行更加复杂的骨架操作，例如：附件替换、换肤等                                      |
| premultipliedAlpha | 预乘 Alpha 设置。用于控制渲染时是否启用预乘 Alpha模式进行渲染                           |


### 默认配置
在脚本中，你可以通过 `defaultConfig`参数设置默认状态下 Spine 的动画和皮肤
```typescript
class YourAmazingScript {

  onStart() {
    const spineResource = await engine.resourceManager.load(
      {
        url: 'https://your.spineboy.json',
        type: 'Spine',
      },
    );
    const spineEntity = spineResource.instantiate();
    const spine = spineEntity.getComponent(SpineAnimationRenderer);
    spine.defaultState.animationName = 'your-default-animation-name'; // 默认播放的动画名称
    spine.defaultState.loop = true; // 默认播放的动画是否循环
    spine.defaultState.skinName = 'default'; // 默认皮肤名称
    rootEntity.addChild(spineEntity); // 添加至场景
  }

}
``` 
注意：默认配置仅在 SpineAnimationRenderer 组件激活时生效。动态修改动画、皮肤请使用 state 与 skeleton 属性中的方法（见下面的章节）。


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

#### **动画混合**
上面提到的轨道覆盖机制，大有用途。例如，轨道 0 可以有行走、奔跑、游泳或其他动画，轨道 1 可以有一个只为手臂和开枪设置了关键帧的射击动画。此外，为高层轨道设置TrackEntry alpha可使其与下面的轨道混合。例如，轨道 0 可以有一个行走动画，轨道 1 可以有一个跛行动画。当玩家受伤时，增加轨道 1 的alpha值，跛行就会加重。
比如：
```typescript
// 此时动画会边走路，边射击
state.setAnimation(0, 'walk', true);
state.setAnimation(1, 'shoot', true);
```

#### **动画过渡**
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

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*-sY9TrNI8L8AAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay > 0">

如果动画 A 的时长小于 1 秒，则会根据是否设置了循环播放：循环播放直至 1 秒，或者播放完毕后，保持在动画播放完毕的状态直至 1 秒。

当 delay = 0 时，下一个动画会在前一个动画播放完毕后播放，如下图所示：

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*jk2VRaHwUXMAAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay = 0">

假设动画 A 的时长为 1 秒，过渡持续时间为 0.2 秒，当 delay 设置为 0 时，动画 B 会从 1 - 0.2 也就是 0.8 秒开始过渡到动画 B。

当 delay < 0 时，上一个动画未播放完毕前，下一个动画就会开始播放，如下图所示：
同样假设动画 A 的时长为 1 秒，过渡持续时间为 0.2 秒，动画 B 则会从 0.6 秒开始过渡到动画 B。

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*1xJDTLr0ygAAAAAAAAAAAAAADvX8AQ/original" width="350" alt="animation delay < 0">

除了 addAnimation 外，还能够通过 [addEmptyAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addEmptyAnimation) 方法添加空动画。空动画能够让动画回到初始状态。

addEmptyAnimation 接受三个参数：TrackIndex，mixDuration 和 delay。TrackIndex 和 delay 参数与 addAnimation 一样。 mixDuration 是过渡持续时间，动画会在 mixDuration 时间内逐渐回到初始状态。如下图所示（右侧棕色区域即是空动画），

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*UdLBR4xoXAEAAAAAAAAAAAAADvX8AQ/original" width="267" alt="Add empty animation api">

#### **轨道参数**
setAnimation 和 addAnimation 方法都会返回一个对象：TrackEntry。TrackEntry 提供了更多的参数来进行动画控制。
例如：

- timeScale：控制动画播放的速度
- animationStart：控制动画播放的开始时间
- apha：当前动画应用轨道的混合系数
- ...

更多参数可以参考 [TrackEntry 官方文档](https://zh.esotericsoftware.com/spine-api-reference#TrackEntry)
#### **动画事件**

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*j4SmSKjherYAAAAAAAAAAAAADvX8AQ/original" width="681" alt="Animation event diagram">

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
代码中皮肤的名称来自 mix-and-match 示例，在下一个章节中能够看到。


#### **动态加载图集并替换附件**
在传统 Spine 项目中，不同的皮肤通常会被打包到同一个图集中。但是，随着皮肤数量的不断增加，图集纹理数量的增长会导致加载耗时不断上涨。为了解决这一问题，可以通过在运行时加载额外的 Atlas 文件，并基于新图集创建附件并替换原有附件，从而灵活支持大规模皮肤扩展，同时避免对初始加载性能的影响。</br></br>
比如，我们可以把不同皮肤的武器，头饰，眼镜等配件打包到一个额外的图集中，在运行时进行替换。

```typescript
class extends YourAmazingScript {
  async onStart() 
    // 加载额外的图集文件
    const extraAtlas = await this.engine.resourceManager.load('/extra.atlas') as TextureAtlas;
    const { skeleton } = this.entity.getComponent(SpineAnimationRenderer);
    // 待替换附件所在的插槽
    const slot = skeleton.findSlot(slotName);
    // 用于创建新附件的图集区域
    const region = extraAtlas.findRegion(regionName);
    // 基于原本的附件进行克隆出新附件，新附件的图集区域来自于额外的图集文件
    const clone = this.cloneAttachmentWithRegion(slot.attachment, region);
    // 替换附件
    slot.attachment = clone;
  }

  // 附件克隆方法
  cloneAttachmentWithRegion(
    attachment: RegionAttachment | MeshAttachment | Attachment,
    atlasRegion: TextureAtlasRegion,
  ): Attachment {
    let newAttachment: RegionAttachment | MeshAttachment;
    switch (attachment.constructor) {
      case RegionAttachment:
        newAttachment = attachment.copy() as RegionAttachment;
        newAttachment.region = atlasRegion;
        newAttachment.updateRegion();
        break;
      case MeshAttachment:
        const meshAttachment = attachment as MeshAttachment;
        newAttachment = meshAttachment.newLinkedMesh();
        newAttachment.region = atlasRegion;
        newAttachment.updateRegion();
        break;
      default:
        return attachment.copy();
    }
    return newAttachment;
  }
```
</br></br>


下一个章节会给大家展示 [Spine的示例与模板](/docs/graphics/2D/spine/example)