---
order: 2
title: 导入模型
type: 图形
group: 模型
label: Graphics/Model
---

> 模型使用 [Blender](https://docs.blender.org/manual/en/2.80/addons/io_scene_gltf2.html) 等建模软件导出 FBX 或 glTF 格式，也可从 [Sketchfab](https://sketchfab.com/) 等模型网站下载。

准备好模型后，就可以将模型导入到 Galacean 编辑器中进行编辑了，你可以通过以下文件格式导入模型：

- **(.gltf + .bin + 图片)**
- **(.glb + 图片)**
- **(.fbx)**

需要注意的是，编辑器会将 FBX 转换成运行时也可以解析的[ glTF 格式](/docs/graphics/model/glTF/)。接下来，让我们实操一下如何将模型文件导入编辑器。

## 拖拽导入

把模型文件，或者压缩成的 **.zip** 文件拖进资源面板:

<img src="https://gw.alipayobjects.com/zos/OasisHub/d34e7e5f-495f-4777-80e5-860ac7772681/import.gif" alt="import" 
style="zoom:100%;" />

## 按钮上传

点击右上角 **资源面板** -> **GLTF/GLB/FBX**

<img src="https://gw.alipayobjects.com/zos/OasisHub/0d250b2d-4559-4333-802d-be2613db388c/image-20231009112129853.png" alt="image-20231009112129853" style="zoom:50%;" />

## 右键上传

依照 **资源面板** -> **右键** -> **Upload** -> **GLTF/GLB/FBX**

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*OtKERZfkrEAAAAAAAAAAAAAADhuCAQ/original" alt="image-20231009112129853" style="zoom:50%;" />

导入完毕后， **[资产面板](/docs/assets/interface)** 中就会新增导入的模型资产，让我们[看看模型资产包含了什么内容](/docs/graphics/model/assets/)吧。
