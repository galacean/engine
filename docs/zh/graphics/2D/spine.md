---
order: 7
title: Spine
type: 图形
group: 2D
label: Graphics/2D
---

Spine 动画是一款针对游戏开发的 2D 骨骼动画，它通过将图片绑定到骨骼上，然后再控制骨骼实现动画，它可以满足程序对动画的控制与自由度，同时也为美术与设计提供了更高效和简洁的工作流。
相较于传统的帧动画，Spine 动画更具优势：

- **更小的体积:** 传统的动画需要提供每一帧图片。而 Spine 动画只保存骨骼的动画数据，它所占用的空间非常小。
- **美术需求:** Spine 动画需要的美术资源更少，能为您节省出更多的人力物力更好的投入到游戏开发中去。
- **流畅性:** Spine 动画使用差值算法计算中间帧，这能让你的动画总是保持流畅的效果。
- **装备附件:** 图片绑定在骨骼上来实现动画。如果你需要可以方便的更换角色的装备满足不同的需求。甚至改变角色的样貌来达到动画重用的效果。
- **混合:** 动画之间可以进行混合。比如一个角色可以开枪射击，同时也可以走、跑、跳或者游泳。
- **程序动画:** 可以通过代码控制骨骼，比如可以实现跟随鼠标的射击，注视敌人，或者上坡时的身体前倾等效果。

# 在 Galacean 编辑器中使用 Spine 动画
Galacean 编辑器内置了对 Spine 动画的支持，无需额外下载或配置，开箱即用，大大简化了开发流程。
## 资产管理
### 从 Spine 编辑器导出资产
你可以在《Spine用户指南》中找到完整的步骤, 说明如何来:

1. [导出 skeleton 和 animation 数据](https://zh.esotericsoftware.com/spine-export)
2. [导出包含 skeleton 图像的 texture atlases](https://zh.esotericsoftware.com/spine-texture-packer)

下面展示了 spine 导出资产的一个简要流程：

1. 完成动画制作后，单击 `Spine 菜单`>`导出` ，打开导出窗口

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721205852909-9c6db2f1-7e47-45d7-ac0b-a6ebf9f95f68.png#clientId=uf07edf19-371c-4&from=paste&height=354&id=qQazJ&originHeight=812&originWidth=466&originalType=binary&ratio=2&rotation=0&showTitle=false&size=188598&status=done&style=shadow&taskId=u95ae3381-21c1-4bf6-9249-64901470a7e&title=&width=203" width="203">

2. 选择导出窗口左上角的**二进制** （ 推荐使用二进制，以二进制格式而不是JSON格式导出，会使文件体积更小，加载更快

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206075003-d755386d-4669-4ff2-a757-f82ac284e325.png#clientId=uf07edf19-371c-4&from=paste&height=427&id=ufb114b96&originHeight=968&originWidth=1250&originalType=binary&ratio=2&rotation=0&showTitle=false&size=277354&status=done&style=shadow&taskId=u39556ffc-a18d-4cc4-ab5a-6ae5eea1ca8&title=&width=551" width="551">

3. 勾选上，**纹理图集**的打包复选框

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206140885-a03f2be1-6373-48cf-b0cd-6edff71c586d.png#clientId=uf07edf19-371c-4&from=paste&height=422&id=u37a697a3&originHeight=960&originWidth=1250&originalType=binary&ratio=2&rotation=0&showTitle=false&size=301864&status=done&style=shadow&taskId=u98574e54-60c2-4a5b-9b66-62a55911d26&title=&width=549" width="549">

4. 点击 **打包设置**

这里建议勾选 **2 的幂数；预乘和溢出两项请勿勾选**
完成打包设置后，点击**确定**
<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206251962-c1dfb317-d420-465d-aaa4-c1d8784d70c4.png#clientId=uf07edf19-371c-4&from=paste&height=486&id=u1d53bfc0&originHeight=1164&originWidth=1248&originalType=binary&ratio=2&rotation=0&showTitle=false&size=546042&status=done&style=shadow&taskId=ue44ae711-4bc7-4668-925f-84e9ec00870&title=&width=521" width="521">

5. 回到导出窗口，选择导出文件夹后，点击**导出**

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206632354-5782e179-5485-4461-a257-b22d5eea1dc0.png#clientId=uf07edf19-371c-4&from=paste&height=403&id=u20d66c56&originHeight=966&originWidth=1244&originalType=binary&ratio=2&rotation=0&showTitle=false&size=327047&status=done&style=shadow&taskId=u74c46bf0-7f7b-45b7-8757-6cedbfac3aa&title=&width=519" width="519">

6. 将会得到三个如下文件：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206737659-cd768958-f4e4-4edd-a6ff-0bd16bd82d22.png#clientId=uf07edf19-371c-4&from=paste&height=152&id=uf58744da&originHeight=246&originWidth=656&originalType=binary&ratio=2&rotation=0&showTitle=false&size=70043&status=done&style=shadow&taskId=u31c50a47-bd13-4c0a-80a4-76db96d8118&title=&width=406" width="406">

spineboy.skel 包含了 skeleton  animation 数据，spineboy.atlas 包含了 texture atlas 信息，导出的图片可能有多张，每张图片都代表了 texture altas 中的一页

### 在 Galacean 编辑器中导入资产
打开编辑器后，将导出的文件直接拖入到[资产面板](https://antg.antgroup.com/engine/docs/latest/cn/assets-interface)中，完成上传

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/gif/76063/1721208067896-206d850e-20fc-44a6-9987-6a8556b10e3b.gif#clientId=uf07edf19-371c-4&from=paste&height=540&id=u4bb88103&originHeight=1080&originWidth=1984&originalType=binary&ratio=2&rotation=0&showTitle=false&size=8620071&status=done&style=shadow&taskId=ua9290849-8cb2-46ac-98b6-e2b22ab0d83&title=&width=992" width="992">

也可以点击资产面板的上传按钮进行上传：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208282563-ba24bcfc-74bd-4c32-b5ba-c289f2ea6d01.png#clientId=uf07edf19-371c-4&from=paste&height=819&id=ud32f3a82&originHeight=1638&originWidth=3014&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1171591&status=done&style=shadow&taskId=u01d46d27-0380-444f-8e79-60e3d602bd4&title=&width=1507" width="1507">

上传完成后，在资产面板中能够看到上传的 spine 素材


#### SpineSkeletonData 资产

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208635628-02647961-4617-46ee-a1cd-81cf0550f5a2.png#clientId=uf07edf19-371c-4&from=paste&height=153&id=u678e6fba&originHeight=242&originWidth=174&originalType=binary&ratio=2&rotation=0&showTitle=false&size=25946&status=done&style=shadow&taskId=u6e5256e7-b3c3-4657-9353-b262e3b4e18&title=&width=110" width="110">

SpineSkeletonData 资产存储了 skeleton 数据，以及对生成的 SpineAtlas 资产的引用
点击资产后，能够在检查器中预览 Spine 动画，预览面板中能够切换皮肤和动画片段：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208897606-b5b510b6-cfd2-4e8f-ada8-ccc529817f5e.png#clientId=uf07edf19-371c-4&from=paste&height=425&id=u2591706d&originHeight=936&originWidth=1052&originalType=binary&ratio=2&rotation=0&showTitle=false&size=254860&status=done&style=shadow&taskId=ua66952b9-8070-4603-ba16-50e9efe8cc4&title=&width=478" width="478">

#### SpineAtlas 资产

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721209002319-1e562970-c951-48f5-838d-8641b2c974b7.png#clientId=uf07edf19-371c-4&from=paste&height=144&id=u793a9e3e&originHeight=248&originWidth=186&originalType=binary&ratio=2&rotation=0&showTitle=false&size=27200&status=done&style=shadow&taskId=u6909b718-88b3-4e61-a735-4a82290c799&title=&width=108" width="108">

SpineAtlas 资产存储了texture atlas 文件，并包含了其对所需 Texture 资产的引用。
点击资产后，能够在检查器中查看其引用的 Texture 资产，以及 Spine 的图集信息

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721209172413-9db9e2c6-c7e8-4795-84d7-b3b42137ef4e.png#clientId=uf07edf19-371c-4&from=paste&height=539&id=u8f790c41&originHeight=1208&originWidth=1048&originalType=binary&ratio=2&rotation=0&showTitle=false&size=222670&status=done&style=shadow&taskId=u7974e9fa-5e0a-4be4-8d8c-a1a77172d32&title=&width=468" width="468">

### 资产更新
如若需要更新你的 Spine 资产，直接覆盖这些文件即可完成更新。从 Spine 编辑器中重新导出资产，并再次导入到 Galacean 编辑器中覆盖原有文件即可。


## 使用 Spine 组件
### 添加组件
完成资产上传后，可以通过添加 Spine 组件，将 Spine 动画添加到场景中。一共有三种方式添加：

1. 拖入添加

拖入添加是最快捷的一种方式。点击 SpineSkeletonData 资产，按住后拖动到视图区，就能快速创建一个添加了 Spine 组件的实体，并指定资产为刚刚选中的资产。

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/gif/76063/1721210070086-6db51cd8-4493-4b4d-93ee-16c8187fe843.gif#clientId=uf07edf19-371c-4&from=paste&height=540&id=ucc4cc750&originHeight=1080&originWidth=1984&originalType=binary&ratio=2&rotation=0&showTitle=false&size=7335004&status=done&style=shadow&taskId=u97b775ac-f0f4-4f0f-80f6-077cacc66d5&title=&width=992" width="992">

2. 快速添加

点击左上角的快速添加按钮，选择 `2D Object`>`SpineAnimationRenderer`，

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721268718386-994e5358-1b2d-44ae-8c3e-721f31e7f8b2.png#clientId=uf07edf19-371c-4&from=paste&height=732&id=u11165e8f&originHeight=1464&originWidth=3014&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1070042&status=done&style=shadow&taskId=uadbb1c9b-c18c-4534-9965-4b74519a4e0&title=&width=1507" width="1507">

添加完成后，能够看到一个新的实体，挂载了 Spine 组件；点击 Resource 属性，选择上传的 SpineSkeletonData 资产，就能看到 Spine 动画啦

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721268852169-d90ebd7b-e691-462b-acd4-4ad1f8c9b5ec.png#clientId=uf07edf19-371c-4&from=paste&height=735&id=u2c86eb68&originHeight=1470&originWidth=3000&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1241001&status=done&style=shadow&taskId=u80f72acd-3fd6-47e2-aa7a-f3d0ab9b56b&title=&width=1500" width="1500">

3. 手动添加

手动添加的方式与快速添加类似，不过需要创建一个新的实体，并通过检查器的 AddComponent 按钮添加 Spine 组件

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721269154975-11ceb229-2142-4c6c-9552-0afba11ae924.png#clientId=uf07edf19-371c-4&from=paste&height=476&id=u450ac092&originHeight=1460&originWidth=1048&originalType=binary&ratio=2&rotation=0&showTitle=false&size=276525&status=done&style=shadow&taskId=u1924fec4-712d-4f69-b343-2ab8021cc8e&title=&width=342" width="342">

添加了 Spine 组件后，同样需要指定组件的 Resource，也就是 Spine 组件要渲染的 SpineSkeletonData 资产。

### 组件配置
点击实体，能够在检查器中看到 Spine 组件的配置项。![image.png](https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721269455151-ceaf0b7e-a00b-4ba4-a109-0cdb08c135f2.png#clientId=uf07edf19-371c-4&from=paste&height=199&id=ucac2f7de&originHeight=398&originWidth=1060&originalType=binary&ratio=2&rotation=0&showTitle=false&size=82934&status=done&style=shadow&taskId=ub50cded7-5559-41de-b104-9db3c4bb4f5&title=&width=530)
通过 Spine 组件能够配置 Spine 动画的默认状态。各属性含义如下：

- Resource：Spine 动画的资源，即 SpineSkeletonData 资产
- Animation：默认播放的动画名称
- Loop：默认播放的动画是否循环
- Skin：默认的皮肤名称
- Scale：默认的缩放系数
- Priority：渲染优先级
### 组件 API
除了在编辑器中配置默认状态外，在[脚本](https://antg.antgroup.com/engine/docs/latest/cn/script)中能够更加灵活的操作。Spine 组件暴露了两个重要的 API 来进行动画控制与骨架操作，以实现更加复杂的效果。
#### 动画控制 AnimationState
在脚本中，你能够通过以下方式获取到 [AnimationState](https://zh.esotericsoftware.com/spine-api-reference#AnimationState) 对象，来控制 Spine 的动画播放逻辑。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState 对象
  }
  
}
```
##### 播放动画
首先，我们来介绍一下最常用的 API：[setAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-setAnimation)
```typescript
state.setAnimation(0, 'animationName', true)
```
setAnimation 函数接受三个参数：

- TrackIndex：动画轨道序号
- animationName：动画名称
- loop：是否循环播放

后两个参数很好理解，第一个参数则包含了 Spine 动画的一个概念：**Track** （轨道）
> Spine 动画在播放时，需要指定一个动画轨道。借助动画轨道，Spine 能够分层应用动画，每一个轨道都能够存储动画与播放参数，轨道的编号从 0 开始累加。在动画应用后，Spine 会从低轨道到高轨道依次应用动画，高轨道上的动画将会覆盖低轨道上的动画。
动画轨道有很多用途，例如，轨道 0 可以有行走、奔跑、游泳或其他动画，轨道 1 可以有一个只为手臂和开枪设置了关键帧的射击动画。此外，为高层轨道设置TrackEntry alpha可使其与下面的轨道混合。例如，轨道 0 可以有一个行走动画，轨道 1 可以有一个跛行动画。当玩家受伤时，增加轨道 1 的alpha值，跛行就会加重。


##### 设置过渡
调用 setAnimation 方法后，会立即切换当前轨道的动画。如果你需要动画切换时有过渡效果，就需要设置过渡的持续时间了。这时就需要 [AnimationStateData](https://zh.esotericsoftware.com/spine-api-reference#AnimationStateData) 的 API 来进行设置了：
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { state } = spine; // AnimationState 对象
    const { data } = state; // AnimationStateData 对象
    data.defaultMix = 0.2;
    data.setMix('animationA', 'animationB', 0.3);
  }
  
}
```

- defaultMix 是当两个动画间没有定义混合持续时间时的默认持续时间
- setMix 函数接受三个参数，前两个是需要设置过渡时间的动画名称，第三个则是动画混合的持续时间
##### 动画队列
Spine 还提供了 [addAnimation](https://zh.esotericsoftware.com/spine-api-reference#AnimationState-addAnimation2) 方法来实现动画的队列播放：
```typescript
state.setAnimation(0, 'animationA', false);
state.addAnimation(0, 'animationB', true, 0);
```
addAnimation 接受 4 个参数：

- TrackIndex：动画轨道
- animationName：动画名称
- loop：是否循环播放
- delay：延迟时间

前三个参数很好理解，这里解释一下第四个参数：
delay 代表了前一个动画的持续时间。
当 delay > 0 时（假设 delay 为 1），前一个动画会在播放 1 秒后，切换到下一个动画。如下图所示：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721274299254-431c2e96-9c3b-482e-a06b-350023042200.png#clientId=uf07edf19-371c-4&from=paste&height=129&id=u189d34f4&originHeight=348&originWidth=1286&originalType=binary&ratio=2&rotation=0&showTitle=false&size=92765&status=done&style=none&taskId=u329862b0-6b18-42b7-b7f2-4a5c118842d&title=&width=477" width="477">

如果动画 A 的时长小于 1 秒，则会根据是否设置了循环播放：循环播放直至 1 秒，或者播放完毕后，保持在动画播放完毕的状态直至 1 秒。
当 delay = 0 时，下一个动画会在前一个动画播放完毕后播放，如下图所示：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721274614500-0cde58d2-ebb8-4d07-bf3a-5defb2278733.png#clientId=uf07edf19-371c-4&from=paste&height=168&id=uf2d2deb7&originHeight=476&originWidth=1324&originalType=binary&ratio=2&rotation=0&showTitle=false&size=118555&status=done&style=none&taskId=u1ec109a1-934a-4620-9d40-4d6c5987e6d&title=&width=467" width="467">

假设动画 A 的时长为 1 秒，过渡持续时间为 0.2 秒，当 delay 设置为 0 时，动画 B 会从 1 - 0.2 也就是 0.8 秒开始过渡到动画 B。
当 delay < 0 时，上一个动画未播放完毕前，下一个动画就会开始播放，如下图所示：
同样假设动画 A 的时长为 1 秒，过渡持续时间为 0.2 秒，动画 B 则会从 0.6 秒开始过渡到动画 B。

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721281456701-391d3d2d-d4f4-42df-9947-43aca9e191ca.png#clientId=uf07edf19-371c-4&from=paste&height=189&id=u3e7c7104&originHeight=496&originWidth=1218&originalType=binary&ratio=2&rotation=0&showTitle=false&size=128314&status=done&style=none&taskId=u924e3b93-e550-4b9a-88d6-dc168361331&title=&width=464" width="464">

除了 addAnimation 外，还能够通过 addEmptyAnimation 方法添加空动画。空动画能够让动画回到初始状态。addEmptyAnimation 接受三个参数：TrackIndex，mixDuration 和 delay。TrackIndex 和 delay 参数与 addAnimation 一样。 mixDuration 是过渡持续时间，动画会逐渐回到初始状态。如下图所示（右侧棕色区域即是空动画），

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721283804385-16d67f51-f1ae-48e5-94c5-7e1a9791b2dc.png#clientId=uf07edf19-371c-4&from=paste&height=138&id=u06ecf378&originHeight=516&originWidth=1000&originalType=binary&ratio=2&rotation=0&showTitle=false&size=126222&status=done&style=none&taskId=u1e6ba48f-dd00-49b1-83e2-3566d25f500&title=&width=267" width="267">

##### 轨道参数
setAnimation 和 addAnimation 方法都会返回一个对象：TrackEntry。TrackEntry 提供了更多的参数来进行动画控制。
例如：

- timeScale：控制动画播放的速度
- animationStart：控制动画播放的开始时间
- apha：当前动画应用轨道的混合系数

更多参数可以参考 [TrackEntry 官方文档](https://zh.esotericsoftware.com/spine-api-reference#TrackEntry)
##### 动画事件

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721284098876-d94511d5-d69a-4754-80ef-4f9686cd17a2.png#clientId=uf07edf19-371c-4&from=paste&height=251&id=uf1167cf1&originHeight=280&originWidth=760&originalType=binary&ratio=2&rotation=0&showTitle=false&size=19012&status=done&style=none&taskId=u00edc2c8-9810-44ad-9254-34d8aa2d258&title=&width=681" width="681">

当调用 AnimationState API 进行动画控制时，会触发如上图所示的事件。在新的动画开始播放时，会触发 Start 事件，当动画在动画队列中移除或者中断时，会触发 End 事件。当动画播放完毕时，无论是否循环，都会触发 Complete 事件。
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
      // 还有 end,interrupt,dispose,event 等事件
      // end, interrupt, dispose, event
    })
  }
  
}
```

#### 骨架操作 Skeleton
在脚本中，你能够通过以下方式获取到 [Skeleton](https://zh.esotericsoftware.com/spine-api-reference#Skeleton) 对象，来访问骨骼、插槽、附件等等，并进行各类操作。
```typescript
class YourAmazingScript {

  onStart() {
    const spine = this.entity.getComponent(SpineAnimationRenderer);
    const { skeleton } = spine; // Skeleton 对象
  }
  
}
```
下面是一些常用的操作。
##### 修改骨骼位置
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
‼️ 由于应用动画会修改骨骼位置，所以如果 Spine 在播放动画， 那么骨骼位置的修改需要在应用动画之后，也就是在脚本的 onLateUpdate 生命周期中进行操作。

##### 附件更换
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
‼️ 由于应用动画会修改插槽内的附件，所以如果 Spine 在播放动画，那么附件更换的操作需要在应用动画之后，也就是在脚本的 onLateUpdate 生命周期中进行操作。
##### 换肤与混搭
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
代码中皮肤的名称来自于官方的 mix-and-match 示例，该示例可以在下面的章节看到。

# 在代码中使用 Galacean Spine 运行时
无论是通过编辑器下载的项目，或者是 procode 项目，都需要通过安装 @galacean/engine-spine 来注册 Spine 组件以实现 Spine 动画的加载和渲染。
## 安装
```typescript
npm install @galacean/engine-spine --save
```

## 加载 spine 资产
引入 @galacean/engine-spine 后，就能通过引擎的 resourceManager 加载 Spine 资产，并创建 Spine 动画了。Galacean Spine 加载器支持多方式加载 Spine 资产：
### 加载 Galacean 编辑器中的上传的资产
[导出编辑器项目后](https://antg.antgroup.com/engine/docs/latest/cn/assets-build)，已添加至场景中的 Spine 动画，会在项目运行后自动加载。
如需动态加载 Spine 动画可以按照如下步骤，在代码中进行加载：

1. 找到 Spine 动画的资产链接

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721297144951-6dafb4e3-ccfa-495e-a540-8b3918b66400.png#clientId=u4b0ad8a6-bdc5-4&from=paste&height=480&id=u8ed78f33&originHeight=533&originWidth=359&originalType=binary&ratio=1&rotation=0&showTitle=false&size=40311&status=done&style=none&taskId=udf9587bf-1818-470f-a108-8ca0d7fe9d0&title=&width=323" width="323">

点击 Galacean 编辑器的下载按钮，选择 project URL，拷贝 project.json 后打开，找到上传的 spine 动画文件（skel / json）：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721297264288-7e493fa1-c6dd-4ebe-b674-832e1a566ab4.png#clientId=u19967f75-5563-4&from=paste&height=186&id=u30ef79e4&originHeight=186&originWidth=934&originalType=binary&ratio=1&rotation=0&showTitle=false&size=40438&status=done&style=shadow&taskId=u2fdda912-fec4-4c80-8de7-c96233bedd1&title=&width=934" width="934">

2. 使用 resourceManager 加载
```typescript
import { SpineAnimationRenderer } from '@galacean/engine-spine';

// 初始化 galacean

// 加载 spine 资产
const resource = await engine.resourceManager.load(
  {
    url: 'https://galacean.spineboy.json', // 编辑器资产
    type: 'spine',
  },
);
// 创建实体
const spineEntity = new Entity(engine);
// 添加 spine 组件
const spine = spineEntity.addComponent(SpineAnimationRenderer);
// 设置默认动画
spine.defaultState.animatitonName = 'your-default-animation';
// 添加至场景
root.addChild(spineEntity);

```
### 加载自定义上传的资产
如果你的 Spine 资产未通过 Galacean 编辑器进行上传，同样能够通过 Galacean Spine 加载器进行加载。
```typescript
const resource = await engine.resourceManager.load(
  {
    url: 'https://your.spineboy.json', // 自定义上传的资产
    type: 'spine',
  },
);
```

- 当传递一个 url 地址时，需要确保 atlas 和 texture 资源在相同目录下，即：

https://your.spineboy.atlas，https://your.spineboy.png 文件需要存在。

- 若资源不在相同目录下，还可以通过传递 urls 来进行加载：
```typescript
const resource = await engine.resourceManager.load(
  {
    urls: [
      'https://your.spineboy.json',
      'https://ahother-path1.spineboy.altas',
      'https://ahother-path2.spineboy.png',
    ], // 自定义上传的资产
    type: 'spine',
  },
);
```
若不传递 texture 地址，那么加载器会从 atlas 文件中读区 texture 图片名称，并从 atlas 的相对路径下查找 texture 资源。
若自定上传的资产没有文件后缀（比如 blob 协议的 URL），则可以通过给链接添加 URL query 参数，例如：
https://your.spineboyjson?q=.json，https://your.spineboyatlas?q=.atlas，或者添加 fileExtension 参数来指定资源后缀类型：
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
      'json',
      'atlas',
      'png',
    ]
  },
);
```

# 示例
动画控制
<playground src="spine-animation.ts"></playground>

跟踪射击
<playground src="spine-follow-shoot.ts"></playground>

局部换肤
<playground src="spine-change-attachment.ts"></playground>

整体换肤
<playground src="spine-full-skin-change.ts"></playground>

皮肤混搭
<playground src="spine-mix-and-match.ts"></playground>

物理
<playground src="spine-physics.ts"></playground>

# Spine 版本
@galacen/engine-spine 自 1.2 版本后开始支持 spine 4.x 版本。@galacen/engine-spine 包的 major version 和 minor version 与 spine 版本完全对应，版本对照如下：
<br>@galacean/engine-spine < 1.2 对应 spine version 3.8
<br>@galacean/engine-spine  4.0 对应 spine version 4.0
<br>@galacean/engine-spine  4.1 对应 spine version 4.1
<br>@galacean/engine-spine  4.2 对应 spine version 4.2
<br>.....
# 版本升级
升级到编辑器 1.3 版本后。除了需要在编辑器的[项目设置](https://antg.antgroup.com/engine/docs/latest/cn/interface-menu#%E9%A1%B9%E7%9B%AE%E8%AE%BE%E7%BD%AE)中升级引擎版本外，由于导出 JSON 或者二进制的 Spine 编辑器版本需要与运行时版本[保持一致](https://zh.esotericsoftware.com/spine-versioning#%E5%90%8C%E6%AD%A5%E7%89%88%E6%9C%AC)，所以编辑器升级到 1.3 后，还需要重新导出 4.2 版本的 Spine 资产并上传到编辑器，通过文件覆盖完成资产的更新。

# Spine 性能建议
这里提供一些优化 spine 动画性能的方法：

1. 使用二进制文件（.skel）的形式导出 skeleton，二进制文件的体积更小，加载更快。
2. 建议将附件打包到尽可能少的atlas页中, 并根据绘制顺序将附件分组置入atlas页以防止多余的material切换. 请参考：[Spine 纹理打包：文件夹结构](https://zh.esotericsoftware.com/spine-texture-packer#%E6%96%87%E4%BB%B6%E5%A4%B9%E7%BB%93%E6%9E%84)了解如何在你的Spine atlas中编排 atlas 区域。
3. 少用裁减功能。Spine 的裁减实现是通过动态裁减三角形实现的，性能开销很大。
4. 尽可能少地使用atlas page textures。即，导出是贴图的数量尽可能控制在一张。







