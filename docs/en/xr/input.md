---
order: 5
title: Interaction Manager
type: XR
label: XR
---

The Interaction Manager is a part of the XRManager instance, which you can access through `xrManager.inputManager`. It manages all input devices, including but not limited to:

- Controllers
- Headsets
- Hands
- ...

## Methods

| Method                               | Description              |
| :----------------------------------- | :----------------------- |
| getTrackedDevice                     | Get a device by type     |
| addTrackedDeviceChangedListener      | Add a function to listen for device changes |
| removeTrackedDeviceChangedListener   | Remove a function listening for device changes |

## Usage

You can listen for device updates with the following code:

```typescript
const { inputManager } = xrManager.inputManager;
inputManager.addTrackedDeviceChangedListener(
  (added: readonly XRInput[], removed: readonly XRInput[]) => {
    // 此处添加对新增设备和移除设备的处理
  }
);
```

You can retrieve the pose of the left controller with the following code:

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

> `XRInputButton.Select` corresponds to the WebXR native `XRInputSourceEventType.selectXXX` event.
> `XRInputButton.Squeeze` corresponds to the WebXR native `XRInputSourceEventType.squeezeXXX` event.


