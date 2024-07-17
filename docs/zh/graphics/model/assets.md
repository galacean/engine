---
order: 3
title: 模型资产
type: 图形
group: 模型
label: Graphics/Model
---

模型导入完毕后， **[资产面板](/docs/assets-interface)** 中会新增导入的模型资产，点击资产缩略图，可以看到这个模型的基本信息。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Aiu9SpMRvxYAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

| 区域       | 功能             | 解释                                                               |
| :--------- | :--------------- | :----------------------------------------------------------------- |
| 视图区     | 预览             | 类似 glTF viewer，开发者可以方便地在不同角度观察模型不同动画的形态 |
| 基本信息   | URL              | 模型的 CDN 链接                                                    |
|            | DrawCall         | 绘制这个模型调用绘制的次数                                         |
|            | ComputeTangents  | 对模型顶点数据中切线信息的处理                                     |
| 材质重映射 | 模型中的材质列表 | 对应重映射的材质                                                   |
| 导出       | Cut first frame  | 是否裁剪第一帧                                                     |
|            | isGLB            | 是否导出 GLB 格式                                                  |
|            | Export glb/glTF  | 导出模型到本地                                                     |

## 模型的子资产

将鼠标悬停在模型资产缩略图上，点击右侧出现的三角按钮，模型资产包含的网格、贴图、动画、材质等子资产信息都会被展示在资源面板当中。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*v_imTKivm0oAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

### 网格子资产

点击网格子资产缩略图，可以看到网格的基本信息如下：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*snL9SaV1tp4AAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

| 区域     | 功能         | 解释                     |
| :------- | :----------- | :----------------------- |
| 顶点数据 | 顶点信息列表 | 顶点信息对应的格式与步长 |
| 子网格   | 子网格列表   | 子网格的绘制信息         |

### 纹理子资产

纹理子资产的基本信息与[纹理](/docs/graphics-texture)资产唯一的区别是纹理信息基本都是只读的。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*o8mdQrcfvcoAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

### 材质子资产

同理，[材质](/docs/graphics-material)子资产也是如此：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ATbsRrxjiNsAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

一般情况下，用户不用对模型自带的材质做任何操作；但是在一定场景下，开发者可能想要手动微调材质，比如修改颜色，那么我们可以将原材质进行复制，即点击 **duplicate & remap**，然后就可以在原材质参数的基础上进行修改：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*R9S1Sr1PivEAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />

### 动画子资产

动画子资产以[动画片段](/docs/animation-clip)的形式出现在模型资产中，它也是**只读**的。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*rAq5T4i3TTQAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112328575" style="zoom:50%;" />
