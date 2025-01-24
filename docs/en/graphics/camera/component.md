---
order: 1
title: Camera Component
type: Graphics
group: Camera
label: Graphics/Camera
---

The camera component can project a 3D scene onto a 2D screen. Based on the camera component, we can customize various rendering effects.

First, you need to mount the camera component onto an activated [Entity](/en/docs/core/entity) in the scene. Editor projects usually come with a camera component by default, but you can also add one manually.

<img src="https://gw.alipayobjects.com/zos/OasisHub/c6a1a344-630c-40c6-88ef-abb447cfd183/image-20231009114711623.png" alt="image-20231009114711623" style="zoom:50%;" />

After adding it, you can view the camera properties in the inspector, and the camera preview in the lower left corner allows you to conveniently see the camera effect during the actual project runtime:

<img src="https://gw.alipayobjects.com/zos/OasisHub/d60e9f91-137e-4148-b85e-7458007333c3/image-20240718211520816.png" alt="image-20240718211520816" style="zoom:50%;" />

You can also mount the camera component to an [Entity](/en/docs/core/entity) in the script with the following code:

```typescript
// 创建实体
const entity = root.createChild("cameraEntity");
// 创建相机组件
const camera = entity.addComponent(Camera);
```

## Properties

By modifying the properties of the camera component, you can customize the rendering effects. Below are the property settings exposed by the camera component in the **[Inspector Panel](/en/docs/interface/inspector)**.

<img src="https://gw.alipayobjects.com/zos/OasisHub/af60182b-a31a-4509-a0d4-3eb4cb737087/image-20240718211645854.png" alt="image-20240718211645854" style="zoom:50%;" />

You can also get the camera component and set the corresponding properties through the script.

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

The functionality corresponding to each property is as follows:

| Type | Property | Description |
| :-- | :-- | :-- |
| General | [isOrthographic](/apis/core/#Camera-isOrthographic) | Determines whether to use perspective projection or orthographic projection by setting [isOrthographic](/apis/core/#Camera-isOrthographic). Set to `false` for perspective effect, default is `false`. |
|  | [nearClipPlane](/apis/core/#Camera-nearClipPlane) | Near clipping plane. Objects closer to the camera than this value will not be rendered properly. |
|  | [farClipPlane](/apis/core/#Camera-farClipPlane) | Far clipping plane. Objects farther from the camera than this value will not be rendered properly. |
|  | [viewport](/apis/core/#Camera-viewport) | Viewport, determines the range of content rendered to the target device. Modifying this value can determine the final rendering position in the rendering target. |
|  | [priority](/apis/core/#Camera-priority) | Rendering priority, used to determine the order in which cameras render their content in the case of multiple cameras. |
|  | [enableFrustumCulling](/apis/core/#Camera-enableFrustumCulling) | Whether to enable frustum culling. When enabled, objects outside the rendering range will be culled. Default is `true`. |
|  | [clearFlags](/apis/core/#Camera-clearFlags) | Flags to clear the canvas buffer before rendering this camera. By setting these flags, you can selectively retain the results of the previous camera rendering. |
|  | [cullingMask](/apis/core/#Camera-cullingMask) | Culling mask, used to selectively render rendering components in the scene. |
|  | [aspectRatio](/apis/core/#Camera-aspectRatio) | Aspect ratio of the rendering target, generally automatically calculated based on the canvas size, but can also be manually changed (not recommended). |
|  | [renderTarget](/apis/core/#Camera-renderTarget) | Rendering target, determines which target the content is rendered to. |
|  | [pixelViewport](/apis/core/#Camera-pixelViewport) | The camera's viewport on the screen (in pixel coordinates). If the rendering target is the canvas and the viewport is the entire canvas, the top-left corner is (0, 0) and the bottom-right corner is (canvas.width, canvas.height). |
| Perspective Projection | [fieldOfView](/apis/core/#Camera-fieldOfView) | Field of view, default is 45 degrees (0, 180). |
| Orthographic Projection | [orthographicSize](/apis/core/#Camera-orthographicSize) | In orthographic mode, half the distance from the top to the bottom of the camera's view. |
| Rendering Related | [depthTextureMode](/apis/core/#Camera-depthTextureMode) | Depth texture mode, default is `DepthTextureMode.None`. If enabled, the `camera_DepthTexture` depth texture can be used in the shader. For details, refer to [Camera Texture](/en/docs/graphics/camera/texture/). |
|  | [opaqueTextureEnabled](/apis/core/#Camera-opaqueTextureEnabled) | Whether to enable opaque texture. Default is off. If enabled, the `camera_OpaqueTexture` opaque texture can be used in the shader of the transparent queue. |
|  | [opaqueTextureDownsampling](/apis/core/#Camera-opaqueTextureDownsampling) | When opaque texture is enabled, downsampling can be set according to clarity and performance requirements. |
|  | [msaaSamples](/apis/core/#Camera-msaaSamples) | Number of samples for multi-sample anti-aliasing, effective only when the standalone canvas is enabled, such as `enableHDR`, `enablePostProcess`, `opaqueTextureEnabled`. |
|  | [enableHDR](/apis/core/#Camera-enableHDR) | Whether to enable HDR rendering, allowing the shader's output color to be stored using floating-point numbers, providing a wider range of values for post-processing and other scenarios. |
|  | [enablePostProcess](/apis/core/#Camera-enablePostProcess) | Whether to enable post-processing. For post-processing configuration, see [Post-Processing Tutorial](/en/docs/graphics/postProcess/postProcess). |
|  | [postProcessMask](/apis/core/#Camera-postProcessMask) | Post-processing mask, which determines the effective post-processing components. For post-processing configuration, [Post-Processing Tutorial](/en/docs/graphics/postProcess/postProcess). |

### Culling Mask

The camera component can selectively render the rendering components in the scene by setting the `cullingMask`.

<playground src="culling-mask.ts"></playground>

### Render Target

The camera component can render the result to different targets by setting the `renderTarget`.

<playground src="multi-camera.ts"></playground>

### Frustum Culling

The `enableFrustumCulling` property is enabled by default because, in a 3D world, "things that are not visible do not need to be rendered" is a very natural logic and is the most basic performance optimization. Disabling frustum culling means turning off this optimization. If you want to keep this optimization but always render a specific node, you can set the bounding box of the node's renderer to be infinite.

<playground src="renderer-cull.ts"></playground>

## Methods

The camera component provides various methods (mainly related to `rendering` and `space transformation`) to facilitate developers in achieving the desired customization capabilities. Before that, you need to learn how to get the camera component. If you know which node the camera component is mounted on, you can directly get it through `getComponent` or `getComponentsIncludeChildren`:

```typescript
// 从挂载相机的节点上获取相机组件
const camera = entity.getComponent(Camera);
// 从挂载相机节点的父节点上获取相机组件（不推荐）
const cameras = entity.getComponentsIncludeChildren(Camera, []);
```

If you are not sure which node the camera component is mounted on, you can also get all the camera components in the scene through a more hacky way:

```typescript
// Get all camera components in this scene (not recommended)
const cameras = scene._componentsManager._activeCameras;
```

| Type | Property | Description |
| :-- | :-- | :-- |
| Rendering | [resetProjectionMatrix](/apis/core/#Camera-resetProjectionMatrix) | Reset the custom projection matrix and revert to automatic mode. |
|  | [resetAspectRatio](/apis/core/#Camera-resetAspectRatio) | Reset the custom rendering aspect ratio and revert to automatic mode. |
|  | [render](/apis/core/#Camera-render) | Manual rendering. |
|  | [setReplacementShader](/apis/core/#Camera-setReplacementShader) | Set a global rendering replacement shader. |
|  | [resetReplacementShader](/apis/core/#Camera-resetReplacementShader) | Clear the global rendering replacement shader. |
| Space Transformation | [worldToViewportPoint](/apis/core/#Camera-worldToViewportPoint) | Convert a point from world space to viewport space. |
|  | [viewportToWorldPoint](/apis/core/#Camera-viewportToWorldPoint) | Convert a point from viewport space to world space. |
|  | [viewportPointToRay](/apis/core/#Camera-viewportPointToRay) | Generate a world space ray from a point in viewport space. |
|  | [screenToViewportPoint](/apis/core/#Camera-screenToViewportPoint) | Convert a point from screen space to viewport space. |
|  | [viewportToScreenPoint](/apis/core/#Camera-viewportToScreenPoint) | Convert a point from viewport space to screen space. |
|  | [worldToScreenPoint](/apis/core/#Camera-worldToScreenPoint) | Convert a point from world space to screen space. |
|  | [screenToWorldPoint](/apis/core/#Camera-screenToWorldPoint) | Convert a point from screen space to world space. |
|  | [screenPointToRay](/apis/core/#Camera-screenPointToRay) | Generate a world space ray from a point in screen space. |

### Shader Replacement

With the ability of `setReplacementShader` to globally replace shaders, you can observe specific rendering effects:

<playground src="shader-replacement.ts"></playground>

### Space Transformation

It should be noted that the Z of the point passed into methods like `screenToWorldPoint` and `viewportToWorldPoint` represents the distance from the returned point to the camera.

## onBeginRender and onEndRender

The camera component additionally includes two lifecycle callbacks, [onBeginRender](/apis/core/#Script-onBeginRender) and [onEndRender](/apis/core/#Script-onEndRender). Their sequence can be referenced in the [script lifecycle sequence diagram](/en/docs/script/class/#脚本生命周期).
