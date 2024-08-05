---
order: 1
title: 材质组成
type: 材质
group: 网格
label: Graphics/Material
---

Galacean 材质包含 **[着色器（shader）](/docs/graphics/shader/intro/)、渲染状态（renderStates）、着色器数据（shaderData）**。着色器可以编写顶点、片元代码来决定渲染管线输出到屏幕上像素的颜色；渲染状态可以对渲染管线的上下文做一些额外配置；着色器数据封装了 CPU 传到 GPU 的一些数据集，比如颜色、矩阵、纹理等。

## 渲染状态

Galacean 将对渲染管线的配置封装在了 [RenderState 对象](/apis/core/#RenderState) 中，可以分别对[混合状态（BlendState）](/apis/core/#RenderState-BlendState)、[深度状态（DepthState）](/apis/core/#RenderState-DepthState)、[模版状态（StencilState）](/apis/core/#RenderState-StencilState)、[光栅状态（RasterState）](/apis/core/#RenderState-RasterState)进行配置。我们拿一个透明物体的标准渲染流程来举例，我们希望开启混合模式并设置混合因子，并且因为透明物体是叠加渲染的，所以我们还要关闭深度写入;

```typescript
const renderState = material.renderState;

// 1. 设置颜色混合因子。
const blendState = renderState.blendState;
const target = blendState.targetBlendState;

// src 混合因子为（As，As，As，As）
target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
// dst 混合因子为（1 - As，1 - As，1 - As，1 - As）。
target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
// 操作方式为 src + dst  */
target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;

// 2. 开启颜色混合
target.enabled = true;

// 3. 关闭深度写入。
const depthState = renderState.depthState;
depthState.writeEnabled = false;

// 4. 设置透明渲染队列
renderState.renderQueueType = RenderQueueType.Transparent;
```

> 有关渲染状态的更多选项可以分别查看相应的[API 文档](/apis/core/#RenderState)。

其中渲染队列可以决定这个材质在当前场景中的渲染顺序，引擎底层会对不同范围的渲染队列进行一些特殊处理，如 [RenderQueueType.Transparent](/apis/core/#RenderQueueType-transparent) 会从远到近进行渲染, [RenderQueueType.Opaque](/apis/core/#RenderQueueType-Opaque) 则会从近到远进行渲染。

```typescript
material.renderQueueType = RenderQueueType.Opaque;
```

针对相同的渲染队列，我们还可以设置 [Renderer](/apis/core/#Renderer) 的 `priority` 属性来强制决定渲染顺序，默认为 0，数字越大越后面渲染，如：

```typescript
renderer.priority = -1; // 优先渲染
```
