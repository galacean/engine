---
order: 0
title: 引擎
type: 核心
label: Core
---

`Engine` 在 Galacean Engine 中扮演着总控制器的角色，主要包含了**画布**、**渲染控制**和**引擎子系统管理**等三大功能：

- **[画布](/docs/core-canvas)**：主画布相关的操作，如修改画布宽高等。
- **渲染控制**： 控制渲染的执行/暂停/继续、垂直同步等功能。
- **引擎子系统管理**：
  - [场景管理](/docs/core-scene)
  - [资源管理](/docs/assets-overall)
  - [物理系统](/docs/physics-overall)
  - [交互系统](/docs/input)
  - [XR 系统](/docs/xr-overall)
- **执行环境的上下文管理**：控制 WebGL 等执行环境的上下文管理。

## 初始化

为了方便用户直接创建 web 端 engine，Galacean 提供了 [WebGLEngine](${api}rhi-webgl/WebGLEngine) ：

```typescript
const engine = await WebGLEngine.create({ canvas: "canvas" });
```

> `WebGLEngine.create` 不仅承担着实例化引擎的职责，还负责渲染上下文的配置和某些子系统的初始化。

### 渲染上下文

开发者可以在 [导出界面](/docs/assets-build) 设置上下文的渲染配置。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*WZHzRYIpUzQAAAAAAAAAAAAADhuCAQ/original" style="zoom:50%;" />

您也可以通过脚本设置 [WebGLEngine](${api}rhi-webgl/WebGLEngine) 的第三个参数 [WebGLGraphicDeviceOptions](${api}rhi-webgl/WebGLGraphicDeviceOptions) 来进行管理，拿**画布透明**来举例，引擎默认是将画布的透明通道开启的，即画布会和背后的网页元素混合，如果需要关闭透明，可以这样设置：

```typescript
const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  graphicDeviceOptions: { alpha: false },
});
```

类似的，可以用 `webGLMode` 控制 WebGL1/2，除 `webGLMode` 外的属性将透传给上下文，详情可参考 [getContext 参数释义](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext#parameters)。

### 物理系统

可参考 [物理系统](/docs/physics-overall) 文档

### 交互系统

可参考 [交互系统](/docs/input) 文档

### XR 系统

可参考 [XR 系统](/docs/xr-overall) 文档

## 属性

| 属性名称                                             | 属性释义                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [time](/apis/core/#Engine-time)                       | 引擎时间相关的信息。                                                                                                                                                                                                                            |
| [vSyncCount](/apis/core/#Engine-vSyncCount)           | 引擎默认开启[垂直同步](https://baike.baidu.com/item/%E5%9E%82%E7%9B%B4%E5%90%8C%E6%AD%A5/7263524?fromtitle=V-Sync&fromid=691778)且刷新率 `vSyncCount` 为`1`，即与屏幕刷新率保持一致。如果 `vSyncCount` 设置为`2`，则每刷新 2 帧，引擎更新一次。 |
| [resourceManager](/apis/core/#Engine-resourceManager) | 资源管理                                                                                                                                                                                                                                        |
| [sceneManager](/apis/core/#Engine-sceneManager)       | 场景管理。_Engine_ 是总控制器，_Scene_ 作为场景单元，可以方便大型场景的实体管理；_Camera_ 作为组件挂载在 _Scene_ 中的某一实体下，和现实中的摄像机一样，可以选择拍摄 _Scene_ 中的任何实体 ，最后渲染到屏幕上的一块区域或者离屏渲染。             |
| [inputManager](/apis/core/#Engine-inputManager)       | 交互管理                                                                                                                                                                                                                                        |

### 刷新率

默认情况下引擎采用垂直同步模式并使用 [vSyncCount](/apis/core/#Engine-vSyncCount) 控制渲染刷新率，该模式才渲染帧会等待屏幕的垂直同步信号， [vSyncCount](/apis/core/#Engine-vSyncCount) 代表了渲染帧之间期望的屏幕同步信号次数，默认值为 1，该属性的值必须为整数，例如我们想在一个屏幕刷新率为 60 帧的设备上期望每秒渲染 30 帧，则可以将该值设置为 2。

另外用户还可以关闭垂直同步，即将 [vSyncCount](/apis/core/#Engine-vSyncCount) 设置为 0，然后设置 [targetFrameRate](/apis/core/#Engine-targetFrameRate) 为期望的帧数值，该模式下的渲染不考虑垂直同步信号，而是，如 120 表示 120 帧，即每秒期望刷新 120 次。

```typescript
// 垂直同步
engine.vSyncCount = 1;
engine.vSyncCount = 2;

// 非垂直同步
engine.vSyncCount = 0;
engine.targetFrameRate = 120;
```

> ⚠️ 不建议使用非垂直同步

## 方法

| 方法名称                             | 方法释义           |
| ------------------------------------ | ------------------ |
| [run](/apis/core/#Engine-run)         | 执行引擎渲染帧循环 |
| [pause](/apis/core/#Engine-pause)     | 暂停引擎渲染帧循环 |
| [resume](/apis/core/#Engine-resume)   | 恢复引擎渲渲染循环 |
| [destroy](/apis/core/#Engine-destroy) | 销毁引擎           |
