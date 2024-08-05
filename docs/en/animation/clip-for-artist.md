---
order: 7
title: Art Animation Slicing
type: Animation
label: Animation
---

An **AnimationClip** is a **combination of animations on a timeline**, which can include animations for multiple objects such as rotations, translations, scaling, and weights, like **walking, running, jumping** that can be exported as separate animation clips; Galacean engine can choose which animation clip to play, provided that the FBX or glTF exported from the modeling software contains multiple animation clips.

To reduce communication costs, this article lists several common methods for animation slicing, exporting to glTF for direct use in the Galacean engine, and also verifying functionality through the [glTF Viewer](https://galacean.antgroup.com/#/gltf-viewer) page.

Blender's animation editing interface is very user-friendly, displaying nodes affected by animations clearly and showing keyframes on the timeline, making it recommended for animation slicing.

### Blender

1. Open Blender, import a model in a format supported by Blender, and switch to the **Animation Editing** window:

![image.png](https://gw.alipayobjects.com/zos/OasisHub/6922d329-6cfa-473d-9fd1-312592e7c307/1622617152228-2c30967c-9203-4ad2-b239-6033cb004bc3.png)

2. By using the "New Animation Clip" button in the image above, you can quickly duplicate the current animation clip and then perform unique operations. If the button is not displayed, make sure the **Action Editor** is open:

![image.png](https://gw.alipayobjects.com/zos/OasisHub/53cc73a1-17b2-4a4f-ad42-9a8b059fb69c/1622617514416-e0b83cd6-439f-4003-aa23-f85ca0df04dc.png)

For example, a new animation clip named **animation_copy** is created, and only the last 5 frames of the animation are retained:

<img src="https://gw.alipayobjects.com/zos/OasisHub/fd120209-32a2-4fa1-96d1-a0a1c5c15e25/1622617643472-17314b46-06a6-4368-952a-416814227566.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/02947e43-737d-4a56-87e3-e4eda2c4f6d3/1622617795573-fb73aeec-fbb0-4851-9f8a-1a1909b789d8.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/5a3b2f6c-3700-4f7e-b187-3863314e416b/1622617813768-69bf92bc-ec55-4b00-9ff8-b7ce324e9526.png" alt="image.png" style="zoom:50%;" />

The exported clip timelines must be consistent, which can be configured in two places: the bottom right corner or the output properties:

<img src="https://gw.alipayobjects.com/zos/OasisHub/7158a90b-480a-4e24-9be1-5152d9fdf21d/1622617921344-b032018a-3e07-4189-99f6-f76a1157cc85.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/7346a75e-4303-4818-b629-ab6c7fadd539/1622617946932-c561c4c6-0f30-466e-859a-f948de54541c.png" alt="image.png" style="zoom:50%;" />

3. Since the timelines must be consistent, the animation clips just sliced need to be moved to the starting frame by dragging:

<img src="https://gw.alipayobjects.com/zos/OasisHub/e8dea5bf-3d29-4ebc-8cde-e44813174639/1622618070076-2d006e34-9dcc-4ead-b97c-c86398b63ba4.png" alt="image.png" style="zoom:50%;" />


<img src="https://gw.alipayobjects.com/zos/OasisHub/b973b5bf-2068-4e79-ac74-f200c2cf15d4/1622618030553-ac8afb11-cfea-48b7-82e1-9ca1243af167.png" alt="image.png" style="zoom:50%;" />

4. At this point, the animation slices are ready. Export as glTF or FBX, and integrate with the Galacean engine:

<img src="https://gw.alipayobjects.com/zos/OasisHub/9e29488b-bbb7-45e7-9385-142b399e39f5/1622618144473-9b9c24eb-2186-408f-8b75-ee41c2bf9dbd.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/8013e335-ea1d-4e04-884b-766385810525/1622618286939-c987bfa3-b6a7-46eb-b9cf-f3a7da86bb83.png" alt="image.png" style="zoom:50%;" />

Unity can also export animation slices, but the efficiency is relatively low.

### Unity

Plugin: [AntG-Unity-Plugin.unitypackage.zip](https://www.yuque.com/attachments/yuque/0/2021/zip/381718/1622541632701-4f33e890-5295-4430-8798-d979b8df504f.zip?_lake_card=%7B%22src%22%3A%22https%3A%2F%2Fwww.yuque.com%2Fattachments%2Fyuque%2F0%2F2021%2Fzip%2F381718%2F1622541632701-4f33e890-5295-4430-8798-d979b8df504f.zip%22%2C%22name%22%3A%22AntG-Unity-Plugin.unitypackage.zip%22%2C%22size%22%3A490677%2C%22type%22%3A%22application%2Fzip%22%2C%22ext%22%3A%22zip%22%2C%22status%22%3A%22done%22%2C%22taskId%22%3A%22u4c98eaae-9ce5-43c7-ae94-c26f4ce0c0f%22%2C%22taskType%22%3A%22upload%22%2C%22id%22%3A%22uef3d6075%22%2C%22card%22%3A%22file%22%7D)

1. Download the plugin.

2. Open Unity.

3. Double-click the plugin, **Import** with the default selected options:

<img src="https://gw.alipayobjects.com/zos/OasisHub/a44674c8-b105-4bfe-b128-46f4685a9758/1622551409520-2797ff27-65e9-4360-aa67-6d8438ec46f7.png" alt="image.png" style="zoom:50%;" />

If the installation is successful, you will see the **AntG** option added to the menu bar:

<img src="https://gw.alipayobjects.com/zos/OasisHub/aca2c330-4b8b-44ca-b641-f245b8667e96/1622551587689-1f963ad1-2530-4d5a-b312-25a87e7b99e0.png" alt="image.png" style="zoom:50%;" />

4. Drag the FBX file that needs to be sliced into the resource panel:

<img src="https://gw.alipayobjects.com/zos/OasisHub/07feeb22-1cf0-400f-a4d3-3e7f7e45ec5d/1622551819216-1fecbc86-c8e8-4416-82d5-20cd63094fd4.png" alt="image.png" style="zoom:50%;" />

5. Click on the resource to bring up the animation debugging preview box. Add animation slices and adjust the timeline **start** and **end** for each slice as needed. If the preview animation effect is abnormal, make sure the **Resample Curves** default option is not checked. After slicing, remember to click the **Apply** confirmation button in the bottom right corner.


<img src="https://gw.alipayobjects.com/zos/OasisHub/f0de175b-3f2a-4b12-9e45-11df7acfa183/1622552141748-0151be0c-4f6c-40ee-9071-c7bddbc9eb0c.png" alt="image.png" style="zoom:50%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/b7d9d6b0-cd94-4151-b4c4-06b4102bd656/1622552692349-5551e817-70b5-4093-9b40-b9a7dd45c365.png" alt="image.png" style="zoom:50%;" />

6. At this point, the animation slice resources have been created. Next, let's discuss how to export them. First, drag this resource into the node tree:

<img src="https://gw.alipayobjects.com/zos/OasisHub/5a82bdcb-b1c2-4dfd-942d-85cf441958bd/1622552417304-8b1f1b7b-d99f-47d7-925f-5a70468d4a3e.png" alt="image.png" style="zoom:50%;" />

7. Then add an **Animator** Component to this node:

<img src="https://gw.alipayobjects.com/zos/OasisHub/34102994-c037-4ad7-be0a-941c24f1347f/1622552470594-9e7df115-24c6-4a16-9a64-a7c28206900e.png" alt="image.png" style="zoom:50%;" />

8. As you can see, the Animator component needs to be associated with an Animator Controller resource. Therefore, we need to create a new Animator Controller resource in the resource panel:

<img src="https://gw.alipayobjects.com/zos/OasisHub/1d27fbf5-b2a7-4ee8-869d-5ef409e21fe3/1622552588576-858cb05e-f340-4005-885e-429bbb957403.png" alt="image.png" style="zoom:50%;" />

9. Double-click on this controller resource and drag our previous animation slice into it:

<img src="https://gw.alipayobjects.com/zos/OasisHub/135c7ec7-c688-4324-9226-b684a09fec23/1622552779345-91dcf315-cb56-48a5-9f05-86504a59268a.png" alt="image.png" style="zoom:50%;" />

10. The Animator Controller resource is now ready. Bind it to the Component we just created:

<img src="https://gw.alipayobjects.com/zos/OasisHub/af7a3e74-162c-4c63-b737-09553e8441ad/1622552894104-3693f7fe-2c4d-4dc1-8413-3a3391e11984.png" alt="image.png" style="zoom:50%;" />

11. Right-click on this node, select Export AntG:

<img src="https://gw.alipayobjects.com/zos/OasisHub/1bfefe2b-ca58-4cca-a091-9efe8028a4df/1622552925151-16b86fcc-4680-4611-aa32-d3697bbe5086.png" alt="image.png" style="zoom:50%;" />

12. With that, the exported glTF file of the created animation slice is complete. You can visit Galacean's [glTF Viewer](https://galacean.antgroup.com/#/gltf-viewer) for functional verification. 


