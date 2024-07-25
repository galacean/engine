---
order: 1
title: 在编辑器中使用
type: 图形
group: Spine
label: Graphics/2D/Spine/editor
---

本章节为大家介绍如何在 Galacean 编辑器中使用 Spine 动画。

Galacean 编辑器内置了对 Spine 动画的支持，无需额外下载或配置，开箱即用，大大简化了开发流程。

## 1. 从 Spine 编辑器导出资产
第一步，需要从 Spine 编辑器导出你的 Spine 动画素材，你可以在《Spine用户指南》中找到完整的步骤, 说明如何：

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

这里建议勾选 `2 的幂数`；`预乘`和`溢出`两项请勿勾选
完成打包设置后，点击**确定**
<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206251962-c1dfb317-d420-465d-aaa4-c1d8784d70c4.png#clientId=uf07edf19-371c-4&from=paste&height=486&id=u1d53bfc0&originHeight=1164&originWidth=1248&originalType=binary&ratio=2&rotation=0&showTitle=false&size=546042&status=done&style=shadow&taskId=ue44ae711-4bc7-4668-925f-84e9ec00870&title=&width=521" width="521">

5. 回到导出窗口，选择导出文件夹后，点击**导出**

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206632354-5782e179-5485-4461-a257-b22d5eea1dc0.png#clientId=uf07edf19-371c-4&from=paste&height=403&id=u20d66c56&originHeight=966&originWidth=1244&originalType=binary&ratio=2&rotation=0&showTitle=false&size=327047&status=done&style=shadow&taskId=u74c46bf0-7f7b-45b7-8757-6cedbfac3aa&title=&width=519" width="519">

6. 将会得到三个如下文件：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206737659-cd768958-f4e4-4edd-a6ff-0bd16bd82d22.png#clientId=uf07edf19-371c-4&from=paste&height=152&id=uf58744da&originHeight=246&originWidth=656&originalType=binary&ratio=2&rotation=0&showTitle=false&size=70043&status=done&style=shadow&taskId=u31c50a47-bd13-4c0a-80a4-76db96d8118&title=&width=406" width="406">

spineboy.skel 包含了 skeleton  animation 数据，spineboy.atlas 包含了 texture atlas 信息，导出的图片可能有多张，每张图片都代表了 texture altas 中的一页

## 2. 在 Galacean 编辑器中导入资产
从 Spine 编辑器导出资产后，第二步就要将资产导入至 Galacean 编辑器了。打开编辑器后，将导出的文件直接拖入到[资产面板](https://antg.antgroup.com/engine/docs/latest/cn/assets-interface)中，即可完成上传

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/gif/76063/1721208067896-206d850e-20fc-44a6-9987-6a8556b10e3b.gif#clientId=uf07edf19-371c-4&from=paste&height=540&id=u4bb88103&originHeight=1080&originWidth=1984&originalType=binary&ratio=2&rotation=0&showTitle=false&size=8620071&status=done&style=shadow&taskId=ua9290849-8cb2-46ac-98b6-e2b22ab0d83&title=&width=992" width="992">

也可以点击资产面板的上传按钮进行上传：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208282563-ba24bcfc-74bd-4c32-b5ba-c289f2ea6d01.png#clientId=uf07edf19-371c-4&from=paste&height=819&id=ud32f3a82&originHeight=1638&originWidth=3014&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1171591&status=done&style=shadow&taskId=u01d46d27-0380-444f-8e79-60e3d602bd4&title=&width=1507" width="1507">

上传完成后，在资产面板中能够看到上传的 spine 素材。

### SpineSkeletonData 资产

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208635628-02647961-4617-46ee-a1cd-81cf0550f5a2.png#clientId=uf07edf19-371c-4&from=paste&height=153&id=u678e6fba&originHeight=242&originWidth=174&originalType=binary&ratio=2&rotation=0&showTitle=false&size=25946&status=done&style=shadow&taskId=u6e5256e7-b3c3-4657-9353-b262e3b4e18&title=&width=110" width="110">

SpineSkeletonData 资产存储了 skeleton 数据，以及对生成的 SpineAtlas 资产的引用
点击资产后，能够在检查器中预览 Spine 动画，预览面板中能够切换`皮肤`和`动画片段`：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208897606-b5b510b6-cfd2-4e8f-ada8-ccc529817f5e.png#clientId=uf07edf19-371c-4&from=paste&height=425&id=u2591706d&originHeight=936&originWidth=1052&originalType=binary&ratio=2&rotation=0&showTitle=false&size=254860&status=done&style=shadow&taskId=ua66952b9-8070-4603-ba16-50e9efe8cc4&title=&width=478" width="478">

### SpineAtlas 资产

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721209002319-1e562970-c951-48f5-838d-8641b2c974b7.png#clientId=uf07edf19-371c-4&from=paste&height=144&id=u793a9e3e&originHeight=248&originWidth=186&originalType=binary&ratio=2&rotation=0&showTitle=false&size=27200&status=done&style=shadow&taskId=u6909b718-88b3-4e61-a735-4a82290c799&title=&width=108" width="108">

SpineAtlas 资产存储了texture atlas 文件，并包含了其对所需 Texture 资产的引用。
点击资产后，能够在检查器中查看其引用的 Texture 资产，以及 Spine 的图集信息

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721209172413-9db9e2c6-c7e8-4795-84d7-b3b42137ef4e.png#clientId=uf07edf19-371c-4&from=paste&height=539&id=u8f790c41&originHeight=1208&originWidth=1048&originalType=binary&ratio=2&rotation=0&showTitle=false&size=222670&status=done&style=shadow&taskId=u7974e9fa-5e0a-4be4-8d8c-a1a77172d32&title=&width=468" width="468">

### 资产更新
如若需要更新你的 Spine 资产。从 Spine 编辑器中重新导出资产，并再次导入到 Galacean 编辑器中覆盖原有文件即可。


## 3. 添加 Spine 动画

完成资产上传后，第三步，需要将 Spine 动画添加至场景中。一共有三种方式：

1. 拖入添加

拖入添加是最快捷的一种方式。点击 SpineSkeletonData 资产，按住后拖动到视图区，就能快速创建一个添加了 Spine 组件的实体，并指定资产为刚刚选中的 SpineSkeletonData 资产。

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/gif/76063/1721210070086-6db51cd8-4493-4b4d-93ee-16c8187fe843.gif#clientId=uf07edf19-371c-4&from=paste&height=540&id=ucc4cc750&originHeight=1080&originWidth=1984&originalType=binary&ratio=2&rotation=0&showTitle=false&size=7335004&status=done&style=shadow&taskId=u97b775ac-f0f4-4f0f-80f6-077cacc66d5&title=&width=992" width="992">

2. 快速添加

点击左上角的快速添加按钮，选择 `2D Object`>`SpineAnimationRenderer`，

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721268718386-994e5358-1b2d-44ae-8c3e-721f31e7f8b2.png#clientId=uf07edf19-371c-4&from=paste&height=732&id=u11165e8f&originHeight=1464&originWidth=3014&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1070042&status=done&style=shadow&taskId=uadbb1c9b-c18c-4534-9965-4b74519a4e0&title=&width=1507" width="1507">

添加完成后，能够看到一个新的实体，挂载了 Spine 组件；点击 Resource 属性，选择上传的 SpineSkeletonData 资产，就能看到 Spine 动画啦

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721268852169-d90ebd7b-e691-462b-acd4-4ad1f8c9b5ec.png#clientId=uf07edf19-371c-4&from=paste&height=735&id=u2c86eb68&originHeight=1470&originWidth=3000&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1241001&status=done&style=shadow&taskId=u80f72acd-3fd6-47e2-aa7a-f3d0ab9b56b&title=&width=1500" width="1500">

3. 手动添加

手动添加的方式与快速添加类似，不过需要在节点树中手动创建一个新的实体，并通过检查器的 AddComponent 按钮添加 Spine 组件

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721269154975-11ceb229-2142-4c6c-9552-0afba11ae924.png#clientId=uf07edf19-371c-4&from=paste&height=476&id=u450ac092&originHeight=1460&originWidth=1048&originalType=binary&ratio=2&rotation=0&showTitle=false&size=276525&status=done&style=shadow&taskId=u1924fec4-712d-4f69-b343-2ab8021cc8e&title=&width=342" width="342">

添加了 Spine 组件后，同样需要指定组件的 Resource，也就是 Spine 组件要渲染的 SpineSkeletonData 资产。

### Spine 组件配置
以上三种添加 Spine 动画的方法实际上本质其实是相同的，都是通过给实体 `添加 Spine 组件` ，来让 Spine 动画添加至场景中的。

Spine 组件的配置如下：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721269455151-ceaf0b7e-a00b-4ba4-a109-0cdb08c135f2.png#clientId=uf07edf19-371c-4&from=paste&height=199&id=ucac2f7de&originHeight=398&originWidth=1060&originalType=binary&ratio=2&rotation=0&showTitle=false&size=82934&status=done&style=shadow&taskId=ub50cded7-5559-41de-b104-9db3c4bb4f5&title=&width=530" width="503">

通过 Spine 组件能够配置 Spine 动画的资产以及默认状态：

- Resource：Spine 动画的资源 ( SpineSkeletonData 资产 )
- Animation：默认播放的动画名称
- Loop：默认播放的动画是否循环
- Skin：默认的皮肤名称
- Scale：默认的缩放系数
- Priority：渲染优先级

## 4. 项目导出
最终，完成场景编辑器后，可以参考[项目导出](https://antg.antgroup.com/engine/docs/latest/cn/assets-build) 流程，导出编辑器项目。



</br></br></br></br>
下一章节：[在代码中使用 Galacean Spine 运行时](/docs/graphics/2D/spine/runtime)

