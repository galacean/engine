---
order: 7
title: XR Compatibility
type: XR
label: XR
---

The XR system supports multiple backends (refer to [XR Overview](/en/docs/xr/overall)), currently, the official support is only for the WebXR standard, so the compatibility of XR interactions is also **limited by the device's compatibility with WebXR**.

Before using XR capabilities, you can refer to [CanIUse](https://caniuse.com/?search=webxr) to evaluate the runtime environment. Below is a summary of the current WebXR compatibility.

## Device Support

### PC

- PC browsers that support WebXR (this article uses Mac Chrome)
- Install [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) or other WebXR simulation plugins on PC Chrome

### Android

- Terminals and browsers that support WebXR (this article uses an Android device and the mobile Chrome app on the Android device)
- Android phones need to additionally install [Google Play Services for AR](https://play.google.com/store/apps/details?id=com.google.ar.core&hl=en_US&pli=1)

### IOS

- Safari on iPhones does not currently support WebXR
- Apple Vision Pro supports WebXR

### Headset Devices

Depending on the situation, you can refer to the headset's official website for compatibility information. Most browsers in headsets (browsers with Chromium kernel) support WebXR.

## Runtime Compatibility Check

In the runtime, you can use the following code to check if the current environment supports `AR` or `VR`:

```typescript
// Check if AR is supported
xrManager.sessionManager.isSupportedMode(XRSessionMode.AR);
```

Before adding features, you can use the following code to check the compatibility of the feature:

```typescript
// Check if image tracking is supported
xrManager.isSupportedFeature(XRImageTracking);
```

## Enabling Experimental Features on Android

Android supports some experimental features, but they are turned off by default. You can enable them by setting flags: **Open Chrome on Android** -> **Log in to chrome://flags** -> **Search for WebXR** -> **Enable WebXR Incubations**

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*YJCVTIAe0nEAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

