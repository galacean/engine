---
order: 2
title: 创建图片
type: UI
label: UI
---

`Image` 组件用于在 `UICanvas` 中显示图片。

## 编辑器使用

### 添加 Image 节点

在 **[层级面板](/docs/interface/hierarchy/)** 添加 `Image` 节点

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*9SCNTZNglo0AAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

> 若父亲或祖先节点没有画布组件，会自动添加上根画布节点。

### 设置 Sprite

Image 的显示内容取决于设置的 [Sprite 资产]() ，选中添加了 `Image` 组件的节点，在 **[检查器面板](/docs/interface/inspector)** 的 Sprite 属性选择对应的精灵资产即可替换显示内容。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*aztPTKxnkHEAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### 修改渲染模式

`Image` 目前提供三种绘制模式，分别是普通绘制，九宫绘制与平铺绘制（默认为普通绘制），在不同的绘制模式下，修改绘制宽高可以直观地感受到各种模式之间的渲染差异。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*z6iPRb0U9FUAAAAAAAAAAAAAehuCAQ/original" style="zoom:50%;" />

### 调整尺寸

请参照[快速调整 UI 元素的尺寸](/docs/UI/quickStart/transform)

## 属性

| 属性名 | 描述 |
| :-- | :-- |
| `sprite` | 渲染的精灵 |
| `color` | 精灵颜色 |
| `drawMode` | 绘制模式，支持普通，九宫和平铺绘制模式 |
| `raycastEnabled` | 是否可以被射线检测到 |
| `raycastPadding` | 射线检测的自定义边界与他的碰撞区域的距离，它是归一化的值并且 X，Y，Z，W 分别代表距离左下右上四条边的距离 |

## 脚本开发

<playground src="ui-Image.ts"></playground>
