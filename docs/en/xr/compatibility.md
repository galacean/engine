---
order: 7
title: XR Compatibility
type: XR
label: XR
---

The XR system supports multiple backends (refer to [XR Overview](/en/docs/xr-overall)). Currently, only the WebXR standard is officially supported, so the compatibility of XR interactions is also **limited to device support for WebXR**.

Before using XR capabilities, you can evaluate the runtime environment with [CanIUse](https://caniuse.com/?search=webxr). Below is a summary of current WebXR compatibility.

## Device Support

### PC

- PC browsers that support WebXR (this document uses Mac Chrome)
- Install [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) or other WebXR simulation plugins on PC Chrome

### Android

- Terminals and browsers that support WebXR (this document uses an Android device with the Chrome app)
- Android phones need to install [Google Play Services for AR](https://play.google.com/store/apps/details?id=com.google.ar.core&hl=en_US&pli=1)

### iOS

- Safari on iOS devices does not currently support WebXR
- Apple Vision Pro supports WebXR

### Head-mounted Displays

Depending on the situation, refer to the official website of the head-mounted display for compatibility information. Most browsers in head-mounted displays (browsers with Chromium kernel) support WebXR.

## Runtime Compatibility Check

During runtime, you can determine if the current environment supports `AR` or `VR` with the following code:

```typescript
// Check if AR is supported
xrManager.sessionManager.isSupportedMode(XRSessionMode.AR);
```

Before adding features, you can check the compatibility of the feature with the following code:

```typescript
// Check if image tracking is supported
xrManager.isSupportedFeature(XRImageTracking);
```

## Android Experimental Features

Android supports some experimental features, but they are disabled by default. You can enable them by setting flags: **Open Chrome on Android** -> **Go to chrome://flags** -> **Search for WebXR** -> **Enable WebXR Incubations**

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*YJCVTIAe0nEAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

