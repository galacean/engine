---
order: 2
title: 精灵渲染器
type: 图形
group: 2D
label: Graphics/2D
---

[SpriteRenderer](/apis/core/#SpriteRenderer) 组件用于在 3D/2D 场景中显示图片。

> 注意：精灵渲染器默认在 XoY 平面上放置图片。

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_5fjTp0r2KEAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

## 属性

![属性面板](https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*pcbLSahH--YAAAAAAAAAAAAADjCHAQ/original)

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

## 使用

### 创建

#### 创建带精灵渲染器的节点

通过在 **[层级面板](/docs/interface-hierarchy)** 选中某个节点，依次 **右键** -> **2D Object** -> **Sprite Renderer** 即可快速为选中节点添加一个装载了精灵渲染器的子节点。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*fiA8R5ZwXyUAAAAAAAAAAAAADhuCAQ/original" alt="avatar" style="zoom:50%;" />

#### 为节点挂载精灵渲染器

为已存在的节点挂载精灵渲染器，只需在选中节点的 **[检查器面板](/docs/interface-inspector)** ，依次选择 **Add Component** -> **2D** -> **Sprite Renderer** 即可为该节点挂载精灵渲染器。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*UnDbQZHMOCcAAAAAAAAAAAAADhuCAQ/original" alt="avatar" style="zoom:50%;" />

#### 脚本创建

同样的，在脚本中我们可以用如下代码为节点挂载精灵渲染器：

```typescript
const spriteRenderer = entity.addComponent(SpriteRenderer);
spriteRenderer.sprite = sprite;
```

### 设置精灵

需要显示图片的时候，需要先给一个实体添加精灵组件，然后设置精灵资产，如下：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*adizTpp_l5cAAAAAAAAAAAAADjCHAQ/original" alt="avatar"  />

### 渲染尺寸

设置 `SpriteRenderer` 的 `width` 与 `height` 可以明确指定精灵在三维空间中显示的尺寸，若没有设置，则会将 `Sprite` 的尺寸作为默认值。

<playground src="sprite-size.ts"></playground>

### 设置颜色

可以通过设置 `color` 属性来调整颜色，从而实现一些淡入淡出的效果，如下：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*5pRRSLLGfq8AAAAAAAAAAAAADjCHAQ/original" alt="avatar"  />

### 图片翻转

除了基本的图片显示，`SpriteRenderer` 还支持图片的翻转，只需要通过设置属性 `flipX/flipY` 即可完成翻转，如下：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*sK6tTJELnP0AAAAAAAAAAAAADjCHAQ/original" alt="avatar"  />

<playground src="sprite-flip.ts"></playground>

### 绘制模式

精灵渲染器目前提供三种绘制模式，分别是普通绘制，九宫绘制与平铺绘制（默认为普通绘制），在不同的绘制模式下，修改绘制宽高可以直观地感受到各种模式之间的渲染差异，如下：

<playground src="sprite-drawMode.ts"></playground>

### 遮罩

请参考[精灵遮罩](/docs/graphics-2d-spriteMask)文档。

## 自定义材质

请参考[自定义着色器](/docs/graphics-shader-custom)文档。

<playground src="sprite-material-blur.ts"></playground>
