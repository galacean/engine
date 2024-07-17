---
order: 2
title: 编辑器使用
type: 材质
group: 网格
label: Graphics/Material
---

## 编辑器使用

### 1. 手动创建材质

<img src="https://gw.alipayobjects.com/zos/OasisHub/b01b0ee2-317e-4acb-8c2f-e07736179d67/image-20240206163405147.png" alt="image-20240206163405147" style="zoom:50%;" />

### 2. 导入模型

参考[模型的导入和使用](/docs/graphics-model-use)教程，我们可以先将模型导入到编辑器，一般情况下，模型已经自动绑定好材质，用户可以不用做任何操作；如果想要修改材质，我们需要点击 `duplicate & remap` 按钮来生成一份该材质的副本，然后再编辑该材质副本。

<img src="https://gw.alipayobjects.com/zos/OasisHub/1f5caa3a-bc01-419f-83c0-dd0ef12692bf/remap.gif" alt="remap" style="zoom:100%;" />

切换着色器时不会重置着色器数据，比如基础颜色为红色，那么即使切换着色器，基础颜色仍为红色。

<img src="https://gw.alipayobjects.com/zos/OasisHub/b3724c3e-e8d9-43af-91c8-c6a80cd027f9/image-20231009112713870.png" alt="image-20231009112713870" style="zoom:50%;" />

### 3. 调整材质

具体操作详见[着色器教程](/docs/graphics-shader)。
