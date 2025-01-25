---
order: 2
title: 创建文字
type: UI
label: UI
---

[Text](/apis/core/#SpriteRenderer) 组件用于在 UICanvas 中显示文字。

## 属性

| 属性名 | 描述 |
| :-- | :-- |
| `Text` | 需要显示的文本 |
| `Color` | 文本颜色 |
| `FontSize` | 文本的字体大小 |
| `Font` | 自定义字体 |
| `LineSpacing` | 行间距 |
| `FontStyle` | 字体样式设置：是否加粗/是否斜体 |
| `HorizontalAlignment` | 水平对齐方式，可选值有：Left/Center/Right |
| `VerticalAlignment` | 竖直对齐方式，可选值有：Top/Center/Bottom |
| `EnableWrapping` | 是否开启换行模式，打开换行模式后，会根据设置的宽来进行换行，如果这时候宽设置为 0，那么文本将不渲染 |
| `OverflowMode` | 当文本总高度超出设置的高的时候的处理方式，可选值有：Overflow/Truncate， Overflow 表示直接溢出显示， Truncate 表示只保留设置高度以内的内容显示，具体显示内容还和文本在竖直方向上的对齐方式有关 |
| `Mask Interaction` | 遮罩类型，用于设置文本是否需要遮罩，以及需要遮罩的情况下，是显示遮罩内还是遮罩外的内容 |
| `Mask Layer` | 文本所属遮罩层，用于和 SpriteMask 进行匹配，默认为 Everything，表示可以和任何 SpriteMask 发生遮罩 |
| `priority` | 渲染优先级，值越小，渲染优先级越高，越优先被渲染 |

## 编辑器

### 添加 Text 节点

在 **[层级面板](/docs/interface/hierarchy/)** 添加 Text 节点

<img src="![alt text](<2025-01-24 17.58.43.gif>)" style="zoom:50%;" />

> 若父亲或祖先节点没有画布组件，会自动添加上根画布节点。

### 设置文本内容

选中添加了 `Text` 组件的节点，在 **[检查器面板](/docs/interface/inspector)** 修改 `text` 属性可以改变 Text 元素的显示内容。

<img src="![alt text](<2025-01-24 18.52.57-1.gif>)" style="zoom:50%;" />

### 设置字体

选中添加了 `Text` 组件的节点，在 **[检查器面板](/docs/interface/inspector)** 修改 `font` 属性可以改变 Text 元素的字体类型。

<img src="![alt text](<2025-01-24 20.08.26.gif>)" style="zoom:50%;" />

### 修改字体大小

`Text` 组件可以通过调整 FontSize 修改渲染尺寸

<img src="![alt text](<2025-01-24 20.05.54.gif>)" style="zoom:50%;" />

> 修改 `UITransform` 的 `size` 不会改变 `Text` 的渲染尺寸。

其他属性含义详见[Text]()

## 脚本开发

<playground src="xr-ar-simple.ts"></playground>
