---
order: 5
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

| 方法                               | 解释                   |
| :--------------------------------- | :--------------------- |
| getTrackedDevice                   | 通过类型获取某个设备   |
| addTrackedDeviceChangedListener    | 添加监听设备变化的函数 |
| removeTrackedDeviceChangedListener | 移除监听设备变化的函数 |

## 使用

通过如下代码可以监听设备的更新信息：

```typescript
const { inputManager } = xrManager.inputManager;
inputManager.addTrackedDeviceChangedListener(
  (added: readonly XRInput[], removed: readonly XRInput[]) => {
    // 此处添加对新增设备和移除设备的处理
  }
);
```

通过如下代码可以获取左手手柄的姿态：

```typescript
const controller = inputManager.getTrackedDevice<XRController>(
  XRTrackedInputDevice.LeftController
);
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

> `XRInputButton.Select` 对应 WebXR 原生 `XRInputSourceEventType.selectXXX` 事件
> `XRInputButton.Squeeze` 对应 WebXR 原生 `XRInputSourceEventType.squeezeXXX` 事件


