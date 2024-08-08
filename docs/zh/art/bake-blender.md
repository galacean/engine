---
order: 0
title: Blender 烘焙
type: 美术
label: Art
---

> **_特别感谢 扫地盲僧及 UU 跑腿效能团队 提供本篇教程_**

美术在模型实际制作过程中，可能会使用较多的素材，材质等以达到更好的视觉效果。但在导出时会出现较大的渲染落差，有时还会丢失一些效果。

我们在最大程度还原 3D 模型渲染流程方面做了一些优化，希望能给大家带来帮助。

### Blender 烘焙

1. 选择模型，目前这个建筑由很多不同的模型组成，我们需要把它们合并成为一个模型

![image.png](https://gw.alipayobjects.com/zos/OasisHub/062ab80a-f13e-4bde-b916-61ed65150540/1635163063741-2a68da6a-bb53-47ef-8404-7f52c127c802.png)

2. 选中 2 个模型合并的快捷键是【ctrl+j】,如果遇到哪些模型有修改器，需要先把修改器应用了再合并，否则修改器做出来的效果会失效。

<img src="https://gw.alipayobjects.com/zos/OasisHub/ba1e9e63-4bf9-431d-95e3-d508e79aad63/1635163542878-3653c3a0-e4f5-4a6c-b7b7-d7184c98a819.png" alt="image.png" style="zoom:67%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/2178d932-f0f2-438a-9f8c-527d1f6f05fa/1635163601788-28030c1a-37cd-4713-ba7a-af822bc3933a.png" alt="image.png" style="zoom: 67%;" />

3. 开始烘焙，选择着色器视图，选中材质属性，在节点视图【shift+a】新建：纹理 -> 图像纹理。

<img src="https://gw.alipayobjects.com/zos/OasisHub/e2ba5925-225c-48fa-b9e7-250e6f4e64a0/1635164198831-1237a411-8897-4ad0-b992-33c8b2b4000c.png" alt="image.png" style="zoom: 67%;" />

4. 点击新建>取一个合适的名字即可，左侧展开就能看到你刚新建的图像纹理。

<img src="https://gw.alipayobjects.com/zos/OasisHub/cd9518f4-a6cd-48f3-8b04-7e7dfd20e661/1635164520500-013dc671-1db1-44f2-94a2-7213e0c5c343.png" alt="image.png" style="zoom:67%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/3864b696-e0f0-4511-a230-1ca067205f67/1635164571943-ab22c291-6e52-49f2-87d3-cacc1ba6d468.png" alt="image.png" style="zoom:67%;" />

5. 把你新建的这个图像纹理复制到建筑下的所有材质节点中，并且是选中状态。

<img src="https://gw.alipayobjects.com/zos/OasisHub/f92bd96d-4afd-42b5-b575-672461acb064/1635164645095-27735887-b48b-48ee-8877-c01efda281f2.png" alt="image.png" style="zoom:67%;" />

6. 配置烘焙参数，先不要点击烘焙，需要下一步的 UV

<img src="https://gw.alipayobjects.com/zos/OasisHub/38b7d00e-1363-420d-bbc0-a06b1cbbb5f1/1635164890110-0f3449bd-7109-4d22-b083-dc725797b93e.png" alt="image.png" style="zoom:67%;" />

### 拆 UV

1. 进入 UV 编辑视图，选中建筑模型，【tab 键】打开编辑模式，可以看到现在 UV 是混乱的

<img src="https://gw.alipayobjects.com/zos/OasisHub/f98df575-2c59-4288-a567-0ecbc66c1548/1635164950027-7a66b660-7b1d-4e83-a499-b37ac64bb6a9.png" alt="image.png" style="zoom:67%;" />

2. 按【U】选择智能 UV 投射，点击确定，就能获得到一个还不错的 UV 展开图，当然如果美术有时间也可以手工

<img src="https://gw.alipayobjects.com/zos/OasisHub/e4d99da8-5173-4fea-81e1-11ad9f4bc0b8/1635165016801-c5692726-84ab-4362-a588-c21ed49740e0.png" alt="image.png" style="zoom:67%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/087c6da9-a38d-4cba-b321-58253235f6f3/1635165024292-fcb7096c-99b7-4ad7-ad22-8600c254294b.png" alt="image.png" style="zoom:67%;" />

<img src="https://gw.alipayobjects.com/zos/OasisHub/f0bb451b-5055-483d-8c33-d4d4c7862a17/1635165041095-d025d34d-b94a-4dae-9748-f8204b69e6fb.png" alt="image.png" style="zoom:67%;" />

3. 返回到着色器视图，选中模型图层和图层下所有材质，设置烘焙下参数不用改，点击烘焙。下面有进度条，耐心等待即可

![image.png](https://gw.alipayobjects.com/zos/OasisHub/e8c439b1-4dc4-419e-abe4-ad7fb7a3b8e5/1635165107820-c9733262-2672-4d1a-ac01-0452ed71c440.png)

4. 烘焙完成，左侧我们新建的图像纹理已经烘焙好了，【alt+s】可快速保存这个烘焙贴图

![image.png](https://gw.alipayobjects.com/zos/OasisHub/96becab7-74e3-4b2b-94e8-0c74bc5929d5/1635165192308-88c6f55f-faa6-4aa2-91c5-2b7114dbc3e8.png)

### 导出 glTF 文件

1. 将上述模型的所有材质都删掉，新建一个背景材质赋予上

<img src="https://gw.alipayobjects.com/zos/OasisHub/3a5bac46-4ccd-4f1a-97d1-5dbb6998d4f5/1635165741680-26d4d4e5-737b-4bc7-9816-afcd532f9501.png" alt="image.png" style="zoom:67%;" />

![image.png](https://gw.alipayobjects.com/zos/OasisHub/a2d19c0a-79b9-4d51-b306-83a86d4388e4/1635165697839-5f88f82f-a66b-453d-970d-3398818ca8d8.png)

2. 把房子的烘焙图拖进节点视图中，连接颜色

![image.png](https://gw.alipayobjects.com/zos/OasisHub/ad28062c-09f0-4586-8ca0-a927f94e57d0/1635165825176-cb680c0b-9126-47f8-8ee2-920df3831a89.png)

3. 导出 glTF 格式，确保这 2 个图层的眼睛和相机都开启状态

![image.png](https://gw.alipayobjects.com/zos/OasisHub/1590d92c-54ba-4efa-b6ca-6c2c3e8b95de/1635165880957-933cc281-8848-436f-a2af-186d818202d1.png)

4. 放入[glTF 查看器](https://galacean.antgroup.com/engine/gltf-viewer)预览效果

![image.png](https://gw.alipayobjects.com/zos/OasisHub/81cfd9e4-474a-45dc-8133-de27a9c08dd6/1635166016557-59978f7f-6c91-4f13-99b3-9907e5c8cd44.png)

希望能给大家带来帮助~
