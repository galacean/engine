---
order: 3
title: 交互管理器
type: XR
label: XR
---

交互管理器从属于 XRManager 实例，你可以通过 `xrManager.inputManager` 获取，他管理所有的输入设备，包括但不限于：

- 手柄
- 头显
- 手
- ……

## 方法

| 方法 | 解释 |
| :-- | :-- |
| getTrackedDevice | 通过类型获取某个设备，通过 `XRTrackedInputDevice` 指定希望获取的设备 |
| addTrackedDeviceChangedListener | 添加监听设备变化的函数，当设备增加或移除时，回调将被执行并且增加设备列表与移除设备列表将被作为入参 |
| removeTrackedDeviceChangedListener | 移除监听设备变化的函数 |

当前支持的输入设备如下：

| 枚举                                 | 解释                     |
| :----------------------------------- | :----------------------- |
| XRTrackedInputDevice.Camera          | 通常为 AR 设备的相机     |
| XRTrackedInputDevice.LeftCamera      | 通常为 VR 设备头显的左眼 |
| XRTrackedInputDevice.RightCamera     | 通常为 VR 设备头显的右眼 |
| XRTrackedInputDevice.Control         | 通常为 AR 设备的遥控     |
| XRTrackedInputDevice.LeftControl     | 通常为 VR 设备的左手柄   |
| XRTrackedInputDevice.RightController | 通常为 VR 设备的右手柄   |

## 使用

通过如下代码可以监听设备的更新信息：

```typescript
const { inputManager } = xrManager.inputManager;
inputManager.addTrackedDeviceChangedListener((added: readonly XRInput[], removed: readonly XRInput[]) => {
  // 此处添加对新增设备和移除设备的处理
});
```

通过如下代码可以获取左手手柄的姿态：

```typescript
const controller = inputManager.getTrackedDevice<XRController>(XRTrackedInputDevice.LeftController);
// 手柄的姿态
controller.gripPose.position;
controller.gripPose.rotation;
controller.gripPose.matrix;
// 是否按下 select 键
controller.isButtonDown(XRInputButton.Select);
// 是否抬起 select 键
controller.isButtonUp(XRInputButton.Select);
// 是否一直按着 select 键
controller.isButtonHeldDown(XRInputButton.Select);
```

> `XRInputButton.Select` 对应 WebXR 原生 `XRInputSourceEventType.selectXXX` 事件 `XRInputButton.Squeeze` 对应 WebXR 原生 `XRInputSourceEventType.squeezeXXX` 事件
