---
order: 1
title: Camera Component
type: Graphics
group: Camera
label: Graphics/Camera
---

The camera component can project a 3D scene onto a 2D screen. Based on the camera component, we can customize various rendering effects.

First, you need to attach the camera component to an activated [Entity](/en/docs/core-entity) in the scene. The editor project usually comes with a camera component, but you can also add it manually.

<img src="https://gw.alipayobjects.com/zos/OasisHub/c6a1a344-630c-40c6-88ef-abb447cfd183/image-20231009114711623.png" alt="image-20231009114711623" style="zoom:50%;" />

After adding it, you can view the camera properties in the inspector, and the camera preview in the bottom left corner allows you to easily see the camera effect when the project is running:

<img src="https://gw.alipayobjects.com/zos/OasisHub/d60e9f91-137e-4148-b85e-7458007333c3/image-20240718211520816.png" alt="image-20240718211520816" style="zoom:50%;" />

You can also attach the camera component to an [Entity](/en/docs/core-entity) in scripts using the following code:

```typescript
// 创建实体
const entity = root.createChild("cameraEntity");
// 创建相机组件
const camera = entity.addComponent(Camera);
```

## Properties

Customize rendering effects by modifying the properties of the camera component. Below are the properties exposed in the **[Inspector Panel](/en/docs/interface-inspector)** for the camera component.

<img src="https://gw.alipayobjects.com/zos/OasisHub/af60182b-a31a-4509-a0d4-3eb4cb737087/image-20240718211645854.png" alt="image-20240718211645854" style="zoom:50%;" />

You can also get the camera component in scripts and set the corresponding properties.

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

The functionality of each property is as follows:

| Type     | Property                                                      | Description                                                                                             |
| :------- | :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------ |
| General  | [isOrthographic](/apis/core/#Camera-isOrthographic)            | Determines whether to use orthographic or perspective projection. Default is `false`.                   |
|          | [nearClipPlane](/apis/core/#Camera-nearClipPlane)              | Near clipping plane                                                                                     |
|          | [farClipPlane](/apis/core/#Camera-farClipPlane)                | Far clipping plane                                                                                      |
|          | [viewport](/apis/core/#Camera-viewport)                        | Viewport, determines the area in the target device where the content is rendered.                       |
|          | [priority](/apis/core/#Camera-priority)                        | Rendering priority, used to determine the order in which the camera's content is rendered in a multi-camera scenario. |
|          | [enableFrustumCulling](/apis/core/#Camera-enableFrustumCulling) | Whether to enable frustum culling, default is `true`.                                                   |
|          | [clearFlags](/apis/core/#Camera-clearFlags)                    | Flags to clear the canvas buffer before rendering with this camera.                                      |
|          | [cullingMask](/apis/core/#Camera-cullingMask)                  | Culling mask, used to selectively render rendering components in the scene.                             |
|          | [aspectRatio](/apis/core/#Camera-aspectRatio)                  | Aspect ratio of the rendering target, usually automatically calculated based on the canvas size, but can be manually changed (not recommended). |
|          | [renderTarget](/apis/core/#Camera-renderTarget)                | Render target, determines where the content is rendered.                                                |
|          | [pixelViewport](/apis/core/#Camera-pixelViewport)              | The viewport of the camera on the screen (in pixel coordinates). In pixel screen coordinates, the top left corner is (0, 0) and the bottom right corner is (1.0, 1.0). |
| Perspective Projection | [fieldOfView](/apis/core/#Camera-fieldOfView)                  | Field of view                                                                                           |
| Orthographic Projection | [orthographicSize](/apis/core/#Camera-orthographicSize)        | Half size of the camera in orthographic mode                                                             |
| Rendering Related | [depthTextureMode](<(/apis/core/#Camera-depthTextureMode)>)    | Depth texture mode, default is `DepthTextureMode.None`. If enabled, the `camera_DepthTexture` depth texture can be used in shaders. |
|  | [opaqueTextureEnabled](<(/apis/core/#Camera-opaqueTextureEnabled)>)    | Whether to enable opaque texture, default is off. If enabled, the `camera_OpaqueTexture` opaque texture can be used in shaders in the transparent queue. |
|  | [opaqueTextureDownsampling](<(/apis/core/#Camera-opaqueTextureDownsampling)>)    | When enabling opaque texture, downsampling can be set based on clarity requirements and performance considerations. |
|  | [msaaSamples](<(/apis/core/#Camera-msaaSamples)>)    | Multi-sample anti-aliasing samples when use independent canvas mode, such as `enableHDR`、`enablePostProcess`、`opaqueTextureEnabled`. |
|  | [enableHDR](<(/apis/core/#Camera-enableHDR)>)     | Enable HDR rendering, allowing the shader output color to be stored using floating point numbers, which can get a wider range of values ​​for post-processing and other situations. |
|  | [enablePostProcess](<(/apis/core/#Camera-enablePostProcess)>)     | Enable post process. The specific configuration refs to [Post Process Tutorial](/docs/graphics/postProcess/postProcess).|

### Clipping Masks

The camera component can selectively render rendering components in the scene by setting `cullingMask`.

<playground src="culling-mask.ts"></playground>

### Render Targets

The camera component can render the rendering results to different targets by setting `renderTarget`.

<playground src="multi-camera.ts"></playground>

### Frustum Culling

The `enableFrustumCulling` property is enabled by default because for a 3D world, the logic "what is not visible does not need to be rendered" is a very natural optimization. Disabling frustum culling means turning off this optimization. If you want to keep this optimization but only want a node to always render, you can set the bounding box of the node's renderer to be infinitely large.

<playground src="renderer-cull.ts"></playground>

## Methods

The camera component provides various methods (mainly related to `rendering` and `space transformation`) to facilitate developers in achieving the desired customization capabilities.

| Type      | Property                                                          | Description                               |
| :-------- | :---------------------------------------------------------------- | :---------------------------------------- |
| Rendering | [resetProjectionMatrix](/apis/core/#Camera-resetProjectionMatrix)  | Reset the custom projection matrix to automatic mode. |
|           | [resetAspectRatio](/apis/core/#Camera-resetAspectRatio)            | Reset the custom aspect ratio to automatic mode. |
|           | [render](/apis/core/#Camera-render)                                | Manual rendering. |
|           | [setReplacementShader](/apis/core/#Camera-setReplacementShader)    | Set the global rendering replacement shader. |
|           | [resetReplacementShader](/apis/core/#Camera-resetReplacementShader)| Clear the global rendering replacement shader. |
| Space Transformation | [worldToViewportPoint](/apis/core/#Camera-worldToViewportPoint) | Convert a point from world space to viewport space. |
|           | [viewportToWorldPoint](/apis/core/#Camera-viewportToWorldPoint)    | Convert a point from viewport space to world space. |
|           | [viewportPointToRay](/apis/core/#Camera-viewportPointToRay)        | Generate a world space ray from a point in viewport space. |
|           | [screenToViewportPoint](/apis/core/#Camera-screenToViewportPoint)  | Convert a point from screen space to viewport space. |
|           | [viewportToScreenPoint](/apis/core/#Camera-viewportToScreenPoint)  | Convert a point from viewport space to screen space. |
|           | [worldToScreenPoint](/apis/core/#Camera-worldToScreenPoint)        | Convert a point from world space to screen space. |
|           | [screenToWorldPoint](/apis/core/#Camera-screenToWorldPoint)        | Convert a point from screen space to world space. |
|           | [screenPointToRay](/apis/core/#Camera-screenPointToRay)            | Generate a world space ray from a point in screen space. |

## Get Camera Component

Assuming you know which node the camera component is mounted on, you can directly retrieve it using `getComponent` or `getComponentsIncludeChildren`:

```typescript
// 从挂载相机的节点上获取相机组件
const camera = entity.getComponent(Camera);
// 从挂载相机节点的父节点上获取相机组件（不推荐）
const cameras = entity.getComponentsIncludeChildren(Camera, []);
```

If you are unsure about the node where the camera component is mounted, you can also access all camera components in the scene using a more hacky approach:

```typescript
// Retrieve all camera components in this scene (not recommended)
const cameras = scene._activeCameras;
```

## onBeginRender and onEndRender

Camera components also include [onBeginRender](/apis/core/#Script-onBeginRender) and [onEndRender](/apis/core/#Script-onEndRender) additional lifecycle callbacks. The sequence of these callbacks can be referred to in the [Script Lifecycle Sequence Diagram](/en/docs/script)

