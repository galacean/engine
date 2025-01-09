---
order: 1
title: 在编辑器中使用
type: 图形
group: Spine
label: Graphics/2D/Spine/editor
---

Galacean 编辑器内置了对 Spine 动画的支持，无需额外下载或配置，开箱即用，大大简化了开发流程。本章节为大家介绍如何在 Galacean 编辑器中使用 Spine 动画。

>编辑器版本依赖请参照：[版本/性能章节](/docs/graphics/2D/spine/other)


## 1. 从 Spine 编辑器导出资产
第一步，需要从 Spine 编辑器导出你的 Spine 动画素材，你可以在[《Spine用户指南》](https://zh.esotericsoftware.com/spine-user-guide) 中找到完整的步骤, 说明如何：

1. [导出 skeleton 和 animation 数据](https://zh.esotericsoftware.com/spine-export)
2. [导出包含 skeleton 图像的 texture atlases](https://zh.esotericsoftware.com/spine-texture-packer)

下面展示了 spine 导出资产的一个简要流程：

1. 完成动画制作后，单击 `Spine 菜单`>`导出` ，打开导出窗口

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*AhJWTLotiKUAAAAAAAAAAAAADvX8AQ/original" width="203" alt="Export panel in Spine editor" />

2. 选择导出窗口左上角的**二进制** （ 推荐使用二进制，以二进制格式而不是JSON格式导出，会使文件体积更小，加载更快

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*SLgpQr7P8FIAAAAAAAAAAAAADvX8AQ/original" width="551" alt="Export window in Spine editor" />

3. 勾选上**纹理图集**的打包复选框

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*lryOSrLjzEYAAAAAAAAAAAAADvX8AQ/original" width="549" alt="Click packing texture atlas button in Export window" />

4. 点击 **打包设置**

这里的打包设置是指纹理的打包设置，打包配置参数可以参考[官方文档](https://zh.esotericsoftware.com/spine-texture-packer)，完成打包设置后，点击**确定**

<img src="https://mdn.alipayobjects.com/huamei_kz4wfo/afts/img/A*fpulR7_CCisAAAAAAAAAAAAADsp6AQ/original" width="521" alt="Texture pack window in Spine Editor" />

5. 回到导出窗口，选择导出文件夹后，点击**导出**

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*Tv0uRpXYT-gAAAAAAAAAAAAADvX8AQ/original" width="519" alt="Click export button in texture pack window" />

6. 将会得到三个如下文件：

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*2eL6R51ITuAAAAAAAAAAAAAADvX8AQ/original" width="406" alt="Spine assets in folder" />

- spineboy.skel：包含骨骼结构（skeleton）和动画（animation）数据，是动画动作与骨骼绑定的核心信息。
- spineboy.atlas：存储纹理图集（texture atlas）的信息，包括每张纹理在图集中的位置、大小等细节。
- 纹理图片：可能包含多张图片，每张图片代表纹理图集（atlas）中的一页，用于实际渲染动画角色的视觉内容。

## 2. 在 Galacean 编辑器中导入资产
第二步，就要将 Spine 编辑器导出的文件导入至 Galacean 编辑器了。

打开编辑器后，将导出的文件直接拖入到[资产面板](/docs/assets/interface/)中，即可完成上传，如下面的动图所示：

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*u-FHQYyaXlgAAAAAAAAAAAAADvX8AQ/original" width="992" alt="Drag spine assets into Galacean editor"/>

也可以点击资产面板的上传按钮，选择文件进行上传：

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*KaxcS6O7M5EAAAAAAAAAAAAADvX8AQ/original" width="1507" alt="Use upload button to upload spine assets" />
</br>

上传完成后，在资产面板中能够看到上传后的 Spine 资产，包括：<b>SpineSkeletonData 资产</b>，<b>SpineAtlas 资产</b>，以及纹理资产

### SpineSkeletonData 资产

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*-U5CRKWiRlsAAAAAAAAAAAAADvX8AQ/original" width="110" alt="Spine skeleton data asset icon" />

SpineSkeletonData 资产存储了 skeleton 数据，以及对生成的 SpineAtlas 资产的引用
点击资产后，能够在检查器中预览 Spine 动画，预览面板中能够切换`皮肤`和`动画片段`：

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*AXsDRognlqMAAAAAAAAAAAAADvX8AQ/original" width="478" alt="Spine skeleton data preview" />

### SpineAtlas 资产

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*OGNbSaCYQlwAAAAAAAAAAAAADvX8AQ/original" width="108" alt="Spine atlas asset" />

SpineAtlas 资产存储了texture atlas 文件，并包含了其对所需 Texture 资产的引用。
点击资产后，能够在检查器中查看其引用的 Texture 资产，以及 Spine 的图集信息。

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*-j8aSq7wSVAAAAAAAAAAAAAADvX8AQ/original" width="468" alt="Spine atlas preview" />

### 资产更新
如若需要更新你的 Spine 资产。从 Spine 编辑器中重新导出资产，并再次导入到 Galacean 编辑器中覆盖原有文件即可。


## 3. 添加 Spine 动画

完成资产上传后，将 Spine 添加至场景中。一共有以下三种方式：

### 拖入添加

拖入添加是最快捷的一种方式。点击 SpineSkeletonData 资产，按住后拖动到视图区，就能快速创建一个添加了 SpineAnimationRenderer 组件的实体，并指定资产为刚刚选中的 SpineSkeletonData 资产。

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*2s_oTZ4sIU0AAAAAAAAAAAAADvX8AQ/original" width="992" alt="Drag Spine skeleton data asset into viewport"/>

### 快速添加

点击左上角的快速添加按钮，选择 `2D Object`>`SpineAnimationRenderer`，

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*NbafRIIuvuAAAAAAAAAAAAAADvX8AQ/original" width="1507" alt="Quick add Spine animation renderer"/>

添加完成后，能够看到一个新的实体，挂载了 SpineAnimationRenderer 组件；点击 Resource 属性，选择上传的 SpineSkeletonData 资产，就能看到 Spine 动画啦

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*WyOtTJBu98MAAAAAAAAAAAAADvX8AQ/original" width="1500" alt="Select spine skeleton data asset in component panel"/>

### 手动添加

手动添加的方式与快速添加类似，不过需要在节点树中手动创建一个新的实体，并通过检查器的 AddComponent 按钮添加 SpineAnimationRenderer 组件

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*PO1FQ7rjMOkAAAAAAAAAAAAADvX8AQ/original" width="342" alt="Use add component to add spine animation renderer"/>

添加了 SpineAnimationRenderer 组件后，同样需要指定组件的 Resource，也就是 SpineAnimationRenderer 组件要渲染的 SpineSkeletonData 资产。

### SpineAnimationRenderer 组件配置
以上三种添加 Spine 动画的方法实际上本质其实是相同的，都是通过给实体 `添加 SpineAnimationRenderer 组件` ，来让 Spine 动画添加至场景中的。

SpineAnimationRenderer 组件的配置如下：

<img src="https://mdn.alipayobjects.com/huamei_irlgws/afts/img/A*afilTpuoSmwAAAAAAAAAAAAADvX8AQ/original" width="503" alt="Spine animation renderer component config"/>

通过 SpineAnimationRenderer 组件能够配置 Spine 动画的资产以及默认状态：

- Resource：Spine 动画的资源 ( SpineSkeletonData 资产 )
- Animation：默认播放的动画名称
- Loop：默认播放的动画是否循环
- Skin：默认的皮肤名称
- Priority：渲染优先级
- PremultiplyAlpha: 是否以预乘alpha的模式渲染动画

## 4. 项目导出
最终，完成场景编辑器后，可以参考[项目导出](/docs/assets/build/)流程，导出编辑器项目。

</br></br></br></br>
下一章节：[在代码中使用](/docs/graphics/2D/spine/runtime)

