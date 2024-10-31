---
order: 1
title: 调试 XR 互动
type: XR
label: XR
---

本文将主要介绍如何在 PC 上调试，以及如何在 XR 设备预览并调试。

> 若无特殊说明，以下调试项目全部基于 WebXR 开发

## PC 调试

首先准备调试环境， PC 上使用支持 WebXR 的 Chrome 浏览器，并且安装 [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik) 插件。

> 插件的使用方法可参考 [Immersive Web Emulator 仓库](https://github.com/meta-quest/immersive-web-emulator)

准备完毕后，就可以在编辑器上预览 XR 项目了：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*lglHQad-k88AAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

当然，将项目下载到本地脚本构建也可以预览：

```bash
npm install
npm run https
```

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*4rqLS51t6DoAAAAAAAAAAAAADhuCAQ/original" alt="image.png"  />

> WebXR 仅在安全环境（HTTPS）中可用，因此，构建项目调试时需启用 Https。

## 手机端调试

支持手机端调试需满足：

- 手机支持 ARCore ，可参照[支持 ARCore 的设备](https://developers.google.com/ar/devices)
- 安装支持 WebXR 的浏览器（移动端 Chrome 应用）
- 额外安装 [Google Play Services for AR](https://play.google.com/store/apps/details?id=com.google.ar.core&hl=en_US&pli=1)

> `Google Play Services for AR` 是由谷歌开发的增强现实平台（ARCore），有些手机自带此 App ，若没有，可在应用商店搜索，下图为小米应用商城的搜索结果。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*1piTR6lx8T8AAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

上述条件全都满足的前提下，就可以用手机预览本地构建的项目了（需要保证**手机与电脑在同一个局域网**）：

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*YGikQ6UhL5oAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

### 调试

请参考[远程调试安卓设备](https://developer.chrome.com/docs/devtools/remote-debugging?hl=zh-cn)，XR 设备同理。

> 在调试前确保手机开启 **`开发者选项`** ，且允许 **`USB 调试`**

## 最佳实践

由于 XR 调试较为繁琐，我们建议大部分的工作和验证在 PC 预览与调试阶段完成，这样可以显著提升开发效率。
