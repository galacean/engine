---
order: 8
title: 美术动画切片
type: 动画
label: Animation
---

动画切片(**AnimationClip**) 为**一段时间轴上的动画组合**，可以是多个物体的旋转、位移、缩放、权重动画，如**走路、跑步、跳跃**可以分别导出 3 个动画切片；Galacean 引擎可以选择播放哪一个动画切片，前提是建模软件导出的 FBX 或者 glTF 里面包含多个动画切片。

为减少沟通成本，本文列举了几种常见的动画切片方法，导出 glTF 方便 Galacean 引擎直接使用，也可以通过 [glTF 预览](https://galacean.antgroup.com/#/gltf-viewer) 页面进行功能校验。

Blender 的动画编辑页面非常友好，能够清晰地可视化显示受动画影响的节点，并且在时间轴上显示关键帧，因此推荐使用 Blender 进行动画切片。

### Blender

1. 打开 Blender，导入 Blender 支持的模型格式，然后切换到 **动画编辑** 窗口：

![image.png](https://gw.alipayobjects.com/zos/OasisHub/6922d329-6cfa-473d-9fd1-312592e7c307/1622617152228-2c30967c-9203-4ad2-b239-6033cb004bc3.png)

2. 通过上图的 “新建动画切片”按钮，可以快速的复制当前动画切片，然后进行独有的操作，如果没有显示该按钮，请确保打开了 “**动作编辑器**”：

![image.png](https://gw.alipayobjects.com/zos/OasisHub/53cc73a1-17b2-4a4f-ad42-9a8b059fb69c/1622617514416-e0b83cd6-439f-4003-aa23-f85ca0df04dc.png)

举例，新建了一个名为 **animation_copy** 的动画切片，然后只保留最后 5 帧动画：

<img src="https://gw.alipayobjects.com/zos/OasisHub/fd120209-32a2-4fa1-96d1-a0a1c5c15e25/1622617643472-17314b46-06a6-4368-952a-416814227566.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/02947e43-737d-4a56-87e3-e4eda2c4f6d3/1622617795573-fb73aeec-fbb0-4851-9f8a-1a1909b789d8.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/5a3b2f6c-3700-4f7e-b187-3863314e416b/1622617813768-69bf92bc-ec55-4b00-9ff8-b7ce324e9526.png" alt="image.png" style="zoom:50%;" />

导出的切片时间轴必须一致，可以通过右下角或者输出属性两个地方进行配置：

<img src="https://gw.alipayobjects.com/zos/OasisHub/7158a90b-480a-4e24-9be1-5152d9fdf21d/1622617921344-b032018a-3e07-4189-99f6-f76a1157cc85.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/7346a75e-4303-4818-b629-ab6c7fadd539/1622617946932-c561c4c6-0f30-466e-859a-f948de54541c.png" alt="image.png" style="zoom:50%;" />

3. 因为时间轴必须一致，因此需要将刚才切的动画切片，都移到起始帧，拖拽即可：

<img src="https://gw.alipayobjects.com/zos/OasisHub/e8dea5bf-3d29-4ebc-8cde-e44813174639/1622618070076-2d006e34-9dcc-4ead-b97c-c86398b63ba4.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/b973b5bf-2068-4e79-ac74-f200c2cf15d4/1622618030553-ac8afb11-cfea-48b7-82e1-9ca1243af167.png" alt="image.png" style="zoom:50%;" />

4. 至此，动画切片已经准备完成，导出 glTF 或者 FBX ，接入 Galacean 引擎即可：

<img src="https://gw.alipayobjects.com/zos/OasisHub/9e29488b-bbb7-45e7-9385-142b399e39f5/1622618144473-9b9c24eb-2186-408f-8b75-ee41c2bf9dbd.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/8013e335-ea1d-4e04-884b-766385810525/1622618286939-c987bfa3-b6a7-46eb-b9cf-f3a7da86bb83.png" alt="image.png" style="zoom:50%;" />

Unity 也可以导出动画切片，但是效率比较低。

### Unity

插件：[AntG-Unity-Plugin.unitypackage.zip](https://www.yuque.com/attachments/yuque/0/2021/zip/381718/1622541632701-4f33e890-5295-4430-8798-d979b8df504f.zip?_lake_card=%7B%22src%22%3A%22https%3A%2F%2Fwww.yuque.com%2Fattachments%2Fyuque%2F0%2F2021%2Fzip%2F381718%2F1622541632701-4f33e890-5295-4430-8798-d979b8df504f.zip%22%2C%22name%22%3A%22AntG-Unity-Plugin.unitypackage.zip%22%2C%22size%22%3A490677%2C%22type%22%3A%22application%2Fzip%22%2C%22ext%22%3A%22zip%22%2C%22status%22%3A%22done%22%2C%22taskId%22%3A%22u4c98eaae-9ce5-43c7-ae94-c26f4ce0c0f%22%2C%22taskType%22%3A%22upload%22%2C%22id%22%3A%22uef3d6075%22%2C%22card%22%3A%22file%22%7D)

1. 下载插件。

2. 打开 Unity 。

3. 双击插件， **Import** 默认框选选项：

<img src="https://gw.alipayobjects.com/zos/OasisHub/a44674c8-b105-4bfe-b128-46f4685a9758/1622551409520-2797ff27-65e9-4360-aa67-6d8438ec46f7.png" alt="image.png" style="zoom:50%;" />

若安装成功，可以看到菜单栏多出 **AntG** 选项：

<img src="https://gw.alipayobjects.com/zos/OasisHub/aca2c330-4b8b-44ca-b641-f245b8667e96/1622551587689-1f963ad1-2530-4d5a-b312-25a87e7b99e0.png" alt="image.png" style="zoom:50%;" />

4. 把需要切片的 FBX 文件拖拽进资源栏：

<img src="https://gw.alipayobjects.com/zos/OasisHub/07feeb22-1cf0-400f-a4d3-3e7f7e45ec5d/1622551819216-1fecbc86-c8e8-4416-82d5-20cd63094fd4.png" alt="image.png" style="zoom:50%;" />

5. 单击该资源，出现动画调试预览框。增加动画切片，并根据需求调整每个切片的时间轴 **start**、**end**，如果预览动画效果异常，确认没有勾选 **Resample Curves** 这个默认开启选项，切片完成后，记得点击右下角的 **Apply** 确认按钮。

<img src="https://gw.alipayobjects.com/zos/OasisHub/f0de175b-3f2a-4b12-9e45-11df7acfa183/1622552141748-0151be0c-4f6c-40ee-9071-c7bddbc9eb0c.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/b7d9d6b0-cd94-4151-b4c4-06b4102bd656/1622552692349-5551e817-70b5-4093-9b40-b9a7dd45c365.png" alt="image.png" style="zoom:50%;" />

6. 至此，动画切片资源已经制作完毕，接下来介绍如何导出，先将该资源拖拽到节点树中：

<img src="https://gw.alipayobjects.com/zos/OasisHub/5a82bdcb-b1c2-4dfd-942d-85cf441958bd/1622552417304-8b1f1b7b-d99f-47d7-925f-5a70468d4a3e.png" alt="image.png" style="zoom:50%;" />

7. 然后给该节点增加 **Animator** Component:

<img src="https://gw.alipayobjects.com/zos/OasisHub/34102994-c037-4ad7-be0a-941c24f1347f/1622552470594-9e7df115-24c6-4a16-9a64-a7c28206900e.png" alt="image.png" style="zoom:50%;" />

8. 可以看到，Animator 组件需要绑定一个 Animator Controller 资源，因此我们需要在资源栏新建一个 Animator Controller 资源：

<img src="https://gw.alipayobjects.com/zos/OasisHub/1d27fbf5-b2a7-4ee8-869d-5ef409e21fe3/1622552588576-858cb05e-f340-4005-885e-429bbb957403.png" alt="image.png" style="zoom:50%;" />

9. 双击该 controller 资源，将我们之前的动画切片拖拽进去：

<img src="https://gw.alipayobjects.com/zos/OasisHub/135c7ec7-c688-4324-9226-b684a09fec23/1622552779345-91dcf315-cb56-48a5-9f05-86504a59268a.png" alt="image.png" style="zoom:50%;" />

10. Animator Controller 资源制作完毕，绑定到刚才的 Component 上：

<img src="https://gw.alipayobjects.com/zos/OasisHub/af7a3e74-162c-4c63-b737-09553e8441ad/1622552894104-3693f7fe-2c4d-4dc1-8413-3a3391e11984.png" alt="image.png" style="zoom:50%;" />

11. 右键该节点，选择导出 AntG：

<img src="https://gw.alipayobjects.com/zos/OasisHub/1bfefe2b-ca58-4cca-a091-9efe8028a4df/1622552925151-16b86fcc-4680-4611-aa32-d3697bbe5086.png" alt="image.png" style="zoom:50%;" />

12. 至此，制作的动画切片 glTF 文件导出完毕，可以访问 Galacean 的 [glTF 预览](https://galacean.antgroup.com/#/gltf-viewer) 进行功能校验。
