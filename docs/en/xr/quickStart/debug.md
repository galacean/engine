---
order: 1
title: Debugging XR Interaction
type: XR
label: XR
---

This article will mainly introduce how to debug on PC, as well as how to preview and debug on XR devices.

> Unless otherwise specified, the following debugging items are all based on WebXR development.

## PC Debugging

First, prepare the debugging environment. Use the Chrome browser that supports WebXR on the PC, and install the [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) plugin.

> For usage of the plugin, refer to the [Immersive Web Emulator repository](https://github.com/meta-quest/immersive-web-emulator).

Once prepared, you can preview the XR project in the editor:

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*lglHQad-k88AAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

Of course, you can also preview by downloading the project to the local script build:

```bash
npm install
npm run https
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*4rqLS51t6DoAAAAAAAAAAAAADhuCAQ/original" alt="image.png"  />

> WebXR is only available in a secure environment (HTTPS), so you need to enable HTTPS when building the project for debugging.

## Mobile Debugging

To support mobile debugging, the following conditions must be met:

- The phone supports ARCore, refer to [ARCore supported devices](https://developers.google.com/ar/devices).
- Install a browser that supports WebXR (mobile Chrome app).
- Additionally, install [Google Play Services for AR](https://play.google.com/store/apps/details?id=com.google.ar.core&hl=en_US&pli=1).

> `Google Play Services for AR` is an augmented reality platform developed by Google (ARCore). Some phones come with this app pre-installed. If not, you can search for it in the app store. The image below shows the search result in the Xiaomi app store.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*1piTR6lx8T8AAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

With all the above conditions met, you can preview the locally built project on your phone (ensure that **the phone and computer are on the same local network**):

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*YGikQ6UhL5oAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

### Debugging

Please refer to [Remote Debugging Android Devices](https://developer.chrome.com/docs/devtools/remote-debugging?hl=zh-cn), the same applies to XR devices.

> Ensure that the phone has **`Developer Options`** enabled and allows **`USB Debugging`** before debugging.

## Best Practices

Since XR debugging is relatively cumbersome, we recommend completing most of the work and verification during the PC preview and debugging stage. This can significantly improve development efficiency.
