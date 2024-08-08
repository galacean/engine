---
order: 2
title: 纹理
type: 图形
group: 背景
label: Graphics/Background
---

当场景的背景类型设置为纹理时，画布的渲染区域会在相机渲染前会按照填充规则填上对应的纹理。

## 设置纹理背景

依据路径 **[层级面板](/docs/interface/hierarchy)** -> **选中 Scene** -> **[检查器面板](/docs/interface/inspector)** -> **Background 栏** 设置 **Mode** 为 **Texture**，然后选择期望的纹理，可以看到场景的背景发生实时变化。

![](https://gw.alipayobjects.com/zos/OasisHub/2673b2a2-a87b-4707-b3fc-9af334231298/2024-07-18%25252017.50.16.gif)

同样的，在脚本中也可通过如下代码进行设置：

```typescript
// 获取当前场景的背景实例
const background = scene.background;
// 设置背景类型为纹理
background.mode = BackgroundMode.Texture;
// 将一张 2D 纹理设置为背景纹理
background.texture = await engine.resourceManager.load<Texture2D>({
  url: "XXX.jpg",
  type: AssetType.Texture2D,
});
// 设置填充模式为铺满
background.textureFillMode = BackgroundTextureFillMode.Fill;
```

## 属性

需要注意的是，背景的相关属性都在场景的 `background` 属性中，获取到该属性实例后才修改相关属性才能生效。

| 属性            | 作用                                                                                                                                                                                                                                                                                  |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| texture         | 设置背景纹理                                                                                                                                                                                                                                                                          |
| textureFillMode | 设置背景纹理的填充模式，可选 [AspectFitWidth](/apis/core/#BackgroundTextureFillMode-AspectFitWidth), [AspectFitHeight](/apis/core/#BackgroundTextureFillMode-AspectFitHeight) 或 [Fill](/apis/core/#BackgroundTextureFillMode-Fill) , 默认为 `BackgroundTextureFillMode.AspectFitHeight` |

### 填充模式

通过 `background.textureFillMode = BackgroundTextureFillMode.AspectFitWidth` 设置纹理适配模式。

目前纹理适配模式有以下三种：

| 填充模式                                                                | 说明                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| [AspectFitWidth](/apis/core/#BackgroundTextureFillMode-AspectFitWidth)   | 保持宽高比，把纹理宽缩放至 Canvas 的宽，上下居中。 |
| [AspectFitHeight](/apis/core/#BackgroundTextureFillMode-AspectFitHeight) | 保持宽高比，把纹理高缩放至 Canvas 的高，左右居中。 |
| [Fill](/apis/core/#BackgroundTextureFillMode-Fill)                       | 把纹理的宽高填满 Canvas 的宽高。                   |
