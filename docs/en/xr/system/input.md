---
order: 3
title: Interaction Manager
type: XR
label: XR
---

The Interaction Manager is subordinate to the XRManager instance, which you can access via `xrManager.inputManager`. It manages all input devices, including but not limited to:

- Controllers
- Headsets
- Hands
- ……

## Methods

| Method | Description |
| :-- | :-- |
| getTrackedDevice | Get a device by type, specified by `XRTrackedInputDevice` |
| addTrackedDeviceChangedListener | Add a function to listen for device changes. When a device is added or removed, the callback will be executed with the added and removed device lists as parameters |
| removeTrackedDeviceChangedListener | Remove the function that listens for device changes |

Currently supported input devices are as follows:

| Enumeration                          | Description              |
| :----------------------------------- | :----------------------- |
| XRTrackedInputDevice.Camera          | Usually the camera of an AR device |
| XRTrackedInputDevice.LeftCamera      | Usually the left eye of a VR headset |
| XRTrackedInputDevice.RightCamera     | Usually the right eye of a VR headset |
| XRTrackedInputDevice.Control         | Usually the remote control of an AR device |
| XRTrackedInputDevice.LeftControl     | Usually the left controller of a VR device |
| XRTrackedInputDevice.RightController | Usually the right controller of a VR device |

## Usage

You can listen for device updates with the following code:

```typescript
const { inputManager } = xrManager.inputManager;
inputManager.addTrackedDeviceChangedListener((added: readonly XRInput[], removed: readonly XRInput[]) => {
  // 此处添加对新增设备和移除设备的处理
});
```

You can get the pose of the left-hand controller with the following code:

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

> `XRInputButton.Select` corresponds to the WebXR native `XRInputSourceEventType.selectXXX` event. `XRInputButton.Squeeze` corresponds to the WebXR native `XRInputSourceEventType.squeezeXXX` event.
