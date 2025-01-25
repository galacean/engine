---
order: 3
title: 创建按钮
type: UI
label: UI
---

[Button](/apis/core/#SpriteRenderer) 可以在 UICanvas 中构建交互按钮。

## 属性

| 属性名                                                       | 属性类型                                                  | 描述                                                                                              |
| :----------------------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| [sprite](/apis/core/#SpriteRenderer-sprite)                   | [Sprite](/apis/core/#Sprite)                               | 使用精灵的引用                                                                                    |
| [width](/apis/core/#SpriteRenderer-width)                     | Number                                                    | 精灵渲染器的宽，若开发者未自定义渲染器宽度，则默认为精灵宽度                                      |
| [height](/apis/core/#SpriteRenderer-height)                   | Number                                                    | 精灵渲染器的高，若开发者未自定义渲染器高度，则默认为精灵高度                                      |
| [color](/apis/core/#SpriteRenderer-color)                     | [Color](/apis/math/#Color)                                 | 精灵颜色                                                                                          |
| [flipX](/apis/core/#SpriteRenderer-flipX)                     | Boolean                                                   | 渲染时是否 X 轴翻转                                                                               |
| [flipY](/apis/core/#SpriteRenderer-flipY)                     | Boolean                                                   | 渲染时是否 Y 轴翻转                                                                               |
| [drawMode](/apis/core/#SpriteRenderer-drawMode)               | [SpriteDrawMode](/apis/core/#SpriteDrawMode)               | 绘制模式，支持普通，九宫和平铺绘制模式                                                            |
| [maskInteraction](/apis/core/#SpriteRenderer-maskInteraction) | [SpriteMaskInteraction](/apis/core/#SpriteMaskInteraction) | 遮罩类型，用于设置精灵是否需要遮罩，以及需要遮罩的情况下，是显示遮罩内还是遮罩外的内容            |
| [maskLayer](/apis/core/#SpriteRenderer-maskLayer)             | [SpriteMaskLayer](/apis/core/#SpriteMaskLayer)             | 精灵所属遮罩层，用于和 SpriteMask 进行匹配，默认为 Everything，表示可以和任何 SpriteMask 发生遮罩 |

## 编辑器

### 添加 Button 节点

在 **[层级面板](/docs/interface/hierarchy/)** 添加 Button 节点

<img src="![alt text](<2025-01-24 18.02.39.gif>)" style="zoom:50%;" />

> 若父亲或祖先节点没有画布组件，会自动添加上根画布节点。

### 设置 Transition

在编辑器中可以方便地设置按钮在不同状态下的过渡表现

<img src="![alt text](<2025-01-24 20.24.17.gif>)" style="zoom:50%;" />

## 脚本开发

<playground src="xr-ar-simple.ts"></playground>
