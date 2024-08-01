---
order: 1
title: 相机组件
type: 图形
group: 相机
label: Graphics/Camera
---

相机组件可以将 3D 场景投影到 2D 屏幕上，基于相机组件，我们可以定制各种不同的渲染效果。

首先需要将相机组件挂载到在场景中已激活的 [Entity](/docs/core/entity) 上，编辑器项目通常已经自带了相机组件，当然我们也可以自己手动添加。

<img src="https://gw.alipayobjects.com/zos/OasisHub/c6a1a344-630c-40c6-88ef-abb447cfd183/image-20231009114711623.png" alt="image-20231009114711623" style="zoom:50%;" />

添加完毕后，就可以在检查器里可以查看相机属性，并且左下角的相机预览可以方便地查看项目实际运行时的相机效果：

<img src="https://gw.alipayobjects.com/zos/OasisHub/d60e9f91-137e-4148-b85e-7458007333c3/image-20240718211520816.png" alt="image-20240718211520816" style="zoom:50%;" />

您也可以在脚本中通过如下代码为 [Entity](/docs/core/entity) 挂载相机组件：

```typescript
// 创建实体
const entity = root.createChild("cameraEntity");
// 创建相机组件
const camera = entity.addComponent(Camera);
```

## 属性

通过修改相机组件的属性可以定制渲染效果。下方是相机组件在 **[检查器面板](/docs/interface/inspector)** 暴露的属性设置。

<img src="https://gw.alipayobjects.com/zos/OasisHub/af60182b-a31a-4509-a0d4-3eb4cb737087/image-20240718211645854.png" alt="image-20240718211645854" style="zoom:50%;" />

也可以通过脚本去获取相机组件并设置相应的属性。

```typescript
// 从挂载相机的节点上获取相机组件
const camera = entity.getComponent(Camera);
// 设置相机类型
camera.isOrthographic = true;
// 设置相机的近平面
camera.nearClipPlane = 0.1;
// 设置相机的远平面
camera.farClipPlane = 100;
// 设置相机的 FOV（角度制）
camera.fieldOfView = 45;
// 设置相机在画布上的渲染区域（归一化）
camera.viewport = new Vector4(0, 0, 1, 1);
// 设置相机的渲染优先级（值越小，渲染优先级越高）
camera.priority = 0;
// 设置相机是否开启视锥体裁剪
camera.enableFrustumCulling = true;
// 设置相机渲染前的清除标记
camera.clearFlags = CameraClearFlags.All;
// 开启后处理
camera.enablePostProcess = true;
// 开启 HDR
camera.enableHDR = true;
```

其中每个属性对应的功能如下：

| 类型     | 属性                                                           | 解释                                                                                                   |
| :------- | :------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------- |
| 通用     | [isOrthographic](/apis/core/#Camera-isOrthographic)             | 通过设置 [isOrthographic](/apis/core/#Camera-isOrthographic) 来决定透视投影或正交投影。，默认是 `false` |
|          | [nearClipPlane](/apis/core/#Camera-nearClipPlane)               | 近裁剪平面                                                                                             |
|          | [farClipPlane](/apis/core/#Camera-farClipPlane)                 | 远裁剪平面                                                                                             |
|          | [viewport](/apis/core/#Camera-viewport)                         | 视口，确定内容最后被渲染到目标设备里的范围。                                                           |
|          | [priority](/apis/core/#Camera-priority)                         | 渲染优先级，用来确定在多相机的情况下按照什么顺序去渲染相机包含的内容。                                 |
|          | [enableFrustumCulling](/apis/core/#Camera-enableFrustumCulling) | 是否开启视锥剔除，默认为 `true`                                                                        |
|          | [clearFlags](/apis/core/#Camera-clearFlags)                     | 在渲染这个相机前清理画布缓冲的标记                                                                     |
|          | [cullingMask](/apis/core/#Camera-cullingMask)                   | 裁剪遮罩，用来选择性地渲染场景中的渲染组件。                                                           |
|          | [aspectRatio](/apis/core/#Camera-aspectRatio)                   | 渲染目标的宽高比，一般是根据 canvas 大小自动计算，也可以手动改变（不推荐）                             |
|          | [renderTarget](/apis/core/#Camera-renderTarget)                 | 渲染目标，确定内容被渲染到哪个目标上。                                                                 |
|          | [pixelViewport](/apis/core/#Camera-pixelViewport)               | 屏幕上相机的视口（以像素坐标表示）。 在像素屏幕坐标中，左上角为(0, 0)，右下角为(1.0, 1.0)。            |
| 透视投影 | [fieldOfView](/apis/core/#Camera-fieldOfView)                   | 视角                                                                                                   |
| 正交投影 | [orthographicSize](/apis/core/#Camera-orthographicSize)         | 正交模式下相机的一半尺寸                                                                               |
| 渲染相关 | [depthTextureMode](<(/apis/core/#Camera-depthTextureMode)>)     | 深度纹理模式，默认为`DepthTextureMode.None`，如果开启，可以在 shader 中使用 `camera_DepthTexture` 深度纹理。   
|  | [opaqueTextureEnabled](<(/apis/core/#Camera-opaqueTextureEnabled)>)     | 是否启用非透明纹理，默认关闭，如果启用，可以在透明队列的 shader 中使用 `camera_OpaqueTexture` 非透明纹理。                                                             |
|  | [opaqueTextureDownsampling](<(/apis/core/#Camera-opaqueTextureDownsampling)>)     | 启用非透明纹理时，可以设置降采样，可以根据清晰度需求和性能要求来进行设置。                                                             |
|  | [msaaSamples](<(/apis/core/#Camera-msaaSamples)>)     | 多样本抗锯齿采样样本数量，仅当独立画布开启时才能生效，如 `enableHDR`、`enablePostProcess`、`opaqueTextureEnabled`。 |
|  | [enableHDR](<(/apis/core/#Camera-enableHDR)>)     | 是否启用 HDR 渲染，允许 shader 输出的颜色使用浮点数进行存储，可以得到更大范围的值，用于后处理等场景。 |
|  | [enablePostProcess](<(/apis/core/#Camera-enablePostProcess)>)     | 是否启用后处理，后处理配置详见[后处理教程](/docs/graphics/postProcess/postProcess)。|

### 裁剪遮罩

相机组件可以通过设置 `cullingMask` 选择性地渲染场景内的渲染组件

<playground src="culling-mask.ts"></playground>

### 渲染目标

相机组件可以通过设置 `renderTarget` 将渲染结果渲染到不同的目标上。

<playground src="multi-camera.ts"></playground>

### 视锥剔除

`enableFrustumCulling` 属性默认是开启的，因为对于三维世界来说，“看不见的东西就不需要渲染”是个很自然的逻辑，属于最基本的性能优化。关闭视锥剔除意味着关闭此项优化。如果你想保留此项优化，而只想让某个节点始终渲染，可以把节点的渲染器的包围盒设置成无限大。

<playground src="renderer-cull.ts"></playground>

## 方法

相机组件提供各种方法（主要涉及`渲染`与`空间转换`）方便开发者实现期望的定制能力。

| 类型     | 属性                                                               | 解释                                     |
| :------- | :----------------------------------------------------------------- | :--------------------------------------- |
| 渲染     | [resetProjectionMatrix](/apis/core/#Camera-resetProjectionMatrix)   | 重置自定义投影矩阵，恢复到自动模式。     |
|          | [resetAspectRatio](/apis/core/#Camera-resetAspectRatio)             | 重置自定义渲染横纵比，恢复到自动模式。   |
|          | [render](/apis/core/#Camera-render)                                 | 手动渲染。                               |
|          | [setReplacementShader](/apis/core/#Camera-setReplacementShader)     | 设置全局渲染替换着色器。                 |
|          | [resetReplacementShader](/apis/core/#Camera-resetReplacementShader) | 清空全局渲染替换着色器。                 |
| 空间转换 | [worldToViewportPoint](/apis/core/#Camera-worldToViewportPoint)     | 将一个点从世界空间转换到视口空间。       |
|          | [viewportToWorldPoint](/apis/core/#Camera-viewportToWorldPoint)     | 将一个点从视口空间转换到世界空间。       |
|          | [viewportPointToRay](/apis/core/#Camera-viewportPointToRay)         | 通过视口空间中的一个点生成世界空间射线。 |
|          | [screenToViewportPoint](/apis/core/#Camera-screenToViewportPoint)   | 将一个点从屏幕空间转换到视口空间。       |
|          | [viewportToScreenPoint](/apis/core/#Camera-viewportToScreenPoint)   | 将一个点从视口空间转换到屏幕空间。       |
|          | [worldToScreenPoint](/apis/core/#Camera-worldToScreenPoint)         | 将一个点从世界空间转换到屏幕空间。       |
|          | [screenToWorldPoint](/apis/core/#Camera-screenToWorldPoint)         | 将一个点从屏幕空间转换到世界空间。       |
|          | [screenPointToRay](/apis/core/#Camera-screenPointToRay)             | 通过屏幕空间中的一个点生成世界空间射线。 |

## 获取相机组件

在清楚相机组件挂载在哪个节点的前提下，可直接通过 `getComponent` 或 `getComponentsIncludeChildren` 获取：

```typescript
// 从挂载相机的节点上获取相机组件
const camera = entity.getComponent(Camera);
// 从挂载相机节点的父节点上获取相机组件（不推荐）
const cameras = entity.getComponentsIncludeChildren(Camera, []);
```

若不清楚相机组件挂载的节点，也可以通过较为 Hack 的方式获取场景中的所有相机组件：

```typescript
// 获取这个场景中的所有相机组件（不推荐）
const cameras = scene._activeCameras;
```

## onBeginRender 与 onEndRender

相机组件额外包含了 [onBeginRender](/apis/core/#Script-onBeginRender) 与 [onEndRender](/apis/core/#Script-onEndRender) 两个生命周期回调，它们的时序可参考[脚本生命周期时序图](/docs/script)
