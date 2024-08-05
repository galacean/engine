---
order: 1
title: Using in the Editor
type: Graphics
group: Spine
label: Graphics/2D/Spine/editor
---

The Galacean editor has built-in support for Spine animations, no additional downloads or configurations are needed, making the development process much simpler. This chapter introduces how to use Spine animations in the Galacean editor.

> For editor version dependencies, please refer to: [Version/Performance Chapter](/en/docs/graphics/2D/spine/other)

## 1. Export Assets from Spine Editor
The first step is to export your Spine animation assets from the Spine editor. You can find the complete steps in the [Spine User Guide](https://zh.esotericsoftware.com/spine-user-guide), which explains how to:

1. [Export skeleton and animation data](https://zh.esotericsoftware.com/spine-export)
2. [Export texture atlases containing skeleton images](https://zh.esotericsoftware.com/spine-texture-packer)

Below is a brief process of exporting assets from Spine:

1. After completing the animation, click `Spine Menu` > `Export` to open the export window

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721205852909-9c6db2f1-7e47-45d7-ac0b-a6ebf9f95f68.png#clientId=uf07edf19-371c-4&from=paste&height=354&id=qQazJ&originHeight=812&originWidth=466&originalType=binary&ratio=2&rotation=0&showTitle=false&size=188598&status=done&style=shadow&taskId=u95ae3381-21c1-4bf6-9249-64901470a7e&title=&width=203" width="203" alt="Export panel in Spine editor">

2. Select **Binary** in the upper left corner of the export window (it is recommended to use binary, exporting in binary format instead of JSON format will make the file size smaller and load faster)

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206075003-d755386d-4669-4ff2-a757-f82ac284e325.png#clientId=uf07edf19-371c-4&from=paste&height=427&id=ufb114b96&originHeight=968&originWidth=1250&originalType=binary&ratio=2&rotation=0&showTitle=false&size=277354&status=done&style=shadow&taskId=u39556ffc-a18d-4cc4-ab5a-6ae5eea1ca8&title=&width=551" width="551" alt="Export window in Spine editor">

3. Check the **Texture Atlas** packing checkbox

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206140885-a03f2be1-6373-48cf-b0cd-6edff71c586d.png#clientId=uf07edf19-371c-4&from=paste&height=422&id=u37a697a3&originHeight=960&originWidth=1250&originalType=binary&ratio=2&rotation=0&showTitle=false&size=301864&status=done&style=shadow&taskId=u98574e54-60c2-4a5b-9b66-62a55911d26&title=&width=549" width="549" alt="Click packing texture atlas button in Export window">

4. Click **Packing Settings**

Here it is recommended to check `Power of 2`; do not check `Premultiply` and `Bleed`
After completing the packing settings, click **OK**
<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206251962-c1dfb317-d420-465d-aaa4-c1d8784d70c4.png#clientId=uf07edf19-371c-4&from=paste&height=486&id=u1d53bfc0&originHeight=1164&originWidth=1248&originalType=binary&ratio=2&rotation=0&showTitle=false&size=546042&status=done&style=shadow&taskId=ue44ae711-4bc7-4668-925f-84e9ec00870&title=&width=521" width="521" alt="Texture pack window in Spine Editor">

5. Return to the export window, select the export folder, and click **Export**

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206632354-5782e179-5485-4461-a257-b22d5eea1dc0.png#clientId=uf07edf19-371c-4&from=paste&height=403&id=u20d66c56&originHeight=966&originWidth=1244&originalType=binary&ratio=2&rotation=0&showTitle=false&size=327047&status=done&style=shadow&taskId=u74c46bf0-7f7b-45b7-8757-6cedbfac3aa&title=&width=519" width="519" alt="Click export button in texture pack window">

6. You will get the following three files:

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721206737659-cd768958-f4e4-4edd-a6ff-0bd16bd82d22.png#clientId=uf07edf19-371c-4&from=paste&height=152&id=uf58744da&originHeight=246&originWidth=656&originalType=binary&ratio=2&rotation=0&showTitle=false&size=70043&status=done&style=shadow&taskId=u31c50a47-bd13-4c0a-80a4-76db96d8118&title=&width=406" width="406" alt="Spine assets in folder">

spineboy.skel contains skeleton animation data, spineboy.atlas contains texture atlas information, and the exported images may be multiple, each representing a page in the texture atlas.

## 2. Import assets into the Galacean editor
After exporting assets from the Spine editor, the second step is to import the assets into the Galacean editor. Open the editor and drag the exported files directly into the [Assets Panel](/en/docs/assets/interface/) to complete the upload.

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/gif/76063/1721208067896-206d850e-20fc-44a6-9987-6a8556b10e3b.gif#clientId=uf07edf19-371c-4&from=paste&height=540&id=u4bb88103&originHeight=1080&originWidth=1984&originalType=binary&ratio=2&rotation=0&showTitle=false&size=8620071&status=done&style=shadow&taskId=ua9290849-8cb2-46ac-98b6-e2b22ab0d83&title=&width=992" width="992" alt="Drag spine assets into Galacean editor">

You can also click the upload button in the assets panel to upload:

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208282563-ba24bcfc-74bd-4c32-b5ba-c289f2ea6d01.png#clientId=uf07edf19-371c-4&from=paste&height=819&id=ud32f3a82&originHeight=1638&originWidth=3014&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1171591&status=done&style=shadow&taskId=u01d46d27-0380-444f-8e79-60e3d602bd4&title=&width=1507" width="1507" alt="Use upload button to upload spine assets">

After the upload is complete, you will see the uploaded spine assets in the assets panel.

### SpineSkeletonData Asset

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208635628-02647961-4617-46ee-a1cd-81cf0550f5a2.png#clientId=uf07edf19-371c-4&from=paste&height=153&id=u678e6fba&originHeight=242&originWidth=174&originalType=binary&ratio=2&rotation=0&showTitle=false&size=25946&status=done&style=shadow&taskId=u6e5256e7-b3c3-4657-9353-b262e3b4e18&title=&width=110" width="110" alt="Spine skeleton data asset icon">

The SpineSkeletonData asset stores skeleton data and references the generated SpineAtlas asset.
After clicking the asset, you can preview the Spine animation in the inspector. In the preview panel, you can switch `skins` and `animation clips`:

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721208897606-b5b510b6-cfd2-4e8f-ada8-ccc529817f5e.png#clientId=uf07edf19-371c-4&from=paste&height=425&id=u2591706d&originHeight=936&originWidth=1052&originalType=binary&ratio=2&rotation=0&showTitle=false&size=254860&status=done&style=shadow&taskId=ua66952b9-8070-4603-ba16-50e9efe8cc4&title=&width=478" width="478" alt="Spine skeleton data preview">

### SpineAtlas Asset

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721209002319-1e562970-c951-48f5-838d-8641b2c974b7.png#clientId=uf07edf19-371c-4&from=paste&height=144&id=u793a9e3e&originHeight=248&originWidth=186&originalType=binary&ratio=2&rotation=0&showTitle=false&size=27200&status=done&style=shadow&taskId=u6909b718-88b3-4e61-a735-4a82290c799&title=&width=108" width="108" alt="Spine atlas asset">

The SpineAtlas asset stores the texture atlas file and includes references to the required Texture assets.
After clicking the asset, you can view its referenced Texture assets and Spine's atlas information in the inspector.

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721209172413-9db9e2c6-c7e8-4795-84d7-b3b42137ef4e.png#clientId=uf07edf19-371c-4&from=paste&height=539&id=u8f790c41&originHeight=1208&originWidth=1048&originalType=binary&ratio=2&rotation=0&showTitle=false&size=222670&status=done&style=shadow&taskId=u7974e9fa-5e0a-4be4-8d8c-a1a77172d32&title=&width=468" width="468" alt="Spine atlas preview">

### Asset Update
If you need to update your Spine assets, re-export the assets from the Spine editor and re-import them into the Galacean editor to overwrite the original files.


## 3. Adding Spine Animation

After uploading the assets, the third step is to add the Spine animation to the scene. There are three ways to do this:

1. Drag and Drop to Add

Drag and drop is the quickest way. Click on the SpineSkeletonData asset, hold it, and drag it into the viewport. This will quickly create an entity with the SpineAnimationRenderer component added, and the asset will be set to the selected SpineSkeletonData asset.

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/gif/76063/1721210070086-6db51cd8-4493-4b4d-93ee-16c8187fe843.gif#clientId=uf07edf19-371c-4&from=paste&height=540&id=ucc4cc750&originHeight=1080&originWidth=1984&originalType=binary&ratio=2&rotation=0&showTitle=false&size=7335004&status=done&style=shadow&taskId=u97b775ac-f0f4-4f0f-80f6-077cacc66d5&title=&width=992" width="992" alt="Drag Spine skeleton data asset into viewport">

2. Quick Add

Click the quick add button in the top left corner, select `2D Object`>`SpineAnimationRenderer`,

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721268718386-994e5358-1b2d-44ae-8c3e-721f31e7f8b2.png#clientId=uf07edf19-371c-4&from=paste&height=732&id=u11165e8f&originHeight=1464&originWidth=3014&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1070042&status=done&style=shadow&taskId=uadbb1c9b-c18c-4534-9965-4b74519a4e0&title=&width=1507" width="1507" alt="Quick add Spine animation renderer">

After adding, you will see a new entity with the SpineAnimationRenderer component attached. Click the Resource property and select the uploaded SpineSkeletonData asset to see the Spine animation.

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721268852169-d90ebd7b-e691-462b-acd4-4ad1f8c9b5ec.png#clientId=uf07edf19-371c-4&from=paste&height=735&id=u2c86eb68&originHeight=1470&originWidth=3000&originalType=binary&ratio=2&rotation=0&showTitle=false&size=1241001&status=done&style=shadow&taskId=u80f72acd-3fd6-47e2-aa7a-f3d0ab9b56b&title=&width=1500" width="1500" alt="Select spine skeleton data asset in component panel">

3. Manual Add

The manual add method is similar to the quick add method, but you need to manually create a new entity in the node tree and add the SpineAnimationRenderer component via the AddComponent button in the inspector.

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721269154975-11ceb229-2142-4c6c-9552-0afba11ae924.png#clientId=uf07edf19-371c-4&from=paste&height=476&id=u450ac092&originHeight=1460&originWidth=1048&originalType=binary&ratio=2&rotation=0&showTitle=false&size=276525&status=done&style=shadow&taskId=u1924fec4-712d-4f69-b343-2ab8021cc8e&title=&width=342" width="342" alt="Use add component to add spine animation renderer">

添加了 SpineAnimationRenderer 组件后，同样需要指定组件的 Resource，也就是 SpineAnimationRenderer 组件要渲染的 SpineSkeletonData 资产。

### SpineAnimationRenderer 组件配置 {/*examples*/}
以上三种添加 Spine 动画的方法实际上本质其实是相同的，都是通过给实体 `添加 SpineAnimationRenderer 组件` ，来让 Spine 动画添加至场景中的。

SpineAnimationRenderer 组件的配置如下：

<img src="https://intranetproxy.alipay.com/skylark/lark/0/2024/png/76063/1721269455151-ceaf0b7e-a00b-4ba4-a109-0cdb08c135f2.png#clientId=uf07edf19-371c-4&from=paste&height=199&id=ucac2f7de&originHeight=398&originWidth=1060&originalType=binary&ratio=2&rotation=0&showTitle=false&size=82934&status=done&style=shadow&taskId=ub50cded7-5559-41de-b104-9db3c4bb4f5&title=&width=530" width="503" alt="Spine animation renderer component config">

通过 SpineAnimationRenderer 组件能够配置 Spine 动画的资产以及默认状态：

- Resource：Spine 动画的资源 ( SpineSkeletonData 资产 )
- Animation：默认播放的动画名称
- Loop：默认播放的动画是否循环
- Skin：默认的皮肤名称
- Scale：默认的缩放系数
- Priority：渲染优先级

## 4. 项目导出 {/*examples*/}
最终，完成场景编辑器后，可以参考[项目导出](/en/docs/assets/build/)流程，导出编辑器项目。

</br></br></br></br>
下一章节：[在代码中使用 Galacean Spine 运行时](/en/docs/graphics/2D/spine/runtime)
