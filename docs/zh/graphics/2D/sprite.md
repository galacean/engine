---
order: 1
title: 精灵
type: 图形
group: 2D
label: Graphics/2D
---

[Sprite](/apis/core/#Sprite) 是 2D 项目中最重要的资产，他从 [Texture2D](/docs/graphics-texture-2d) 中获取图形源数据，通过设置 [region](/apis/core/#Sprite-region)，[pivot](/apis/core/#Sprite-pivot) 等属性定制期望的渲染结果，若将其赋予[SpriteRenderer](/apis/core/#SpriteRenderer)，挂载了精灵渲染器的节点就可以在三维空间中展示 2D 图片，若将其赋予[SpriteMask](/docs/graphics-2d-spriteMask)，挂载了精灵遮罩的节点就可以对相应的 2D 元素实现遮罩效果，接下来就让我们深入了解精灵的属性和用法。

## 属性

| 属性名                               | 属性类型                          | 描述                                                                                                    |
| :----------------------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------------------ |
| [texture](/apis/core/#Sprite-texture) | [Texture2D](/apis/core/#Texture2D) | 使用纹理的引用                                                                                          |
| [width](/apis/core/#Sprite-width)     | Number                            | 精灵的宽，若开发者未自定义精灵宽度，则默认为纹理像素宽 / 100                                            |
| [height](/apis/core/#Sprite-height)   | Number                            | 精灵的高，若开发者未自定义精灵高度，则默认为纹理像素高 / 100                                            |
| [region](/apis/core/#Sprite-region)   | [Rect](/apis/math/#Rect)           | 精灵在原始纹理上的位置，范围 0 ～ 1                                                                     |
| [pivot](/apis/core/#Sprite-pivot)     | [Vector2](/apis/math/#Vector2)     | 精灵中心点在原始纹理上的 region 中的位置，范围 0 ～ 1                                                   |
| [border](/apis/core/#Sprite-border)   | [Vector4](/apis/math/#Vector4)     | 渲染器的绘制模式为九宫或平铺时，边界配置会影响最终的渲染效果，其中 x,y,z,w 分别对应距左下右上四条边距离 |

region 决定精灵的显示内容，可以在纹理中选择一个矩形区域进行显示，超出部分会自动过滤掉，如下：

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ABvvTJnUgpsAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

pivot 代表精灵中心在 region 中的位置，如下：

<img src="https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*6RyQTpqE4dMAAAAAAAAAAAAAARQnAQ" alt="avatar" style="zoom:50%;" />

## 使用

### 创建

#### 上传精灵

在 **[资产面板](/docs/assets-interface)** 空白处依次 **右键** → **Upload** → **Sprite** → **选中对应图片** 即可上传精灵资产，上传成功后当前资产列表会同步添加一份名为 `图片名.png` 的纹理资产和一份 `图片名-spr.png` 的精灵资产

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*bRghQqoN1GAAAAAAAAAAAAAADhuCAQ/original" alt="avatar"  />

#### 创建空白精灵

在 **[资产面板](/docs/assets-interface)** 空白处依次 **右键** → **Create** → **Sprite** 即可创建一份空白的精灵资产。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*Gv96TrKvRkEAAAAAAAAAAAAADhuCAQ/original" alt="avatar"  />

#### 脚本创建

同样地，在脚本中我们可以用如下代码创建精灵：

```typescript
// 创建一个空白精灵
const sprite = new Sprite(engine);
// 创建一个带纹理的精灵
const spriteWithTexture = new Sprite(engine, texture2D);
```

### 设置属性

这里特别说明下 pivot 在编辑器中的设置。对于 pivot 来说，纹理左下角为 `(0, 0)`，X 轴从左到右，Y 轴从下到上。编辑器中内置了一些常用的 pivot 快捷值，如下：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*ZKFJR5LdJA0AAAAAAAAAAAAADjCHAQ/original" alt="avatar" style="zoom:100%;" />

如果内置值无法满足需求，可以自定义自己的 pivot，如下：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*tuZ7QJEl_wsAAAAAAAAAAAAADjCHAQ/original" alt="avatar" style="zoom:50%;" />
