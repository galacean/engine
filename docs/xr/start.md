---
order: 1
title: 快速开发 XR 互动
type: XR
label: XR
---

开发 XR 互动的流程如下所示：

```mermaid
flowchart LR
   创建XR项目 --> 编辑项目 --> 导出 --> 本地构建 --> PC预览 --> XR设备预览 --> 正式发布
```

编辑项目的环节与其他项目无异，本文将以 XR 模版为例，重点叙述 XR 项目的难点，**本地构建**， **PC 预览**与 **XR 设备预览**。

## 前置准备

由于我们引入的后端为 WebXR ，以 AR 项目为例，需要准备的运行环境与 XR 设备如下：

- 支持 WebXR 的 PC 端浏览器（本文使用 Mac Chrome）
- 支持 WebXR 的终端与浏览器（本文使用安卓机与安卓机搭载的移动端 Chrome 应用）
- 安卓手机需额外安装 [Google Play Services for AR](https://play.google.com/store/apps/details?id=com.google.ar.core&hl=en_US&pli=1)

> `Google Play Services for AR` 是由谷歌开发的增强现实平台（ARCore），有些手机自带此 App ，若没有，可在应用商店搜索，下图为小米应用商城的搜索结果。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*1piTR6lx8T8AAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

### PC 端调试

PC 端 Chrome 推荐安装 [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik)，它是由 Meta 开发的可以让你在 Chrome 上便捷调试 WebXR 的工具，如下图所示，我们在用这款工具在 PC 端 Chrome 中模拟 XR 设备进行调试。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*KR_rQq3sSY4AAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

> 上图左侧为 XR 业务面板视图区，右侧为开发者工具。

### 手机端调试

安卓机器在确认安装 `Google Play Services for AR` 后，可用 Chrome 打开 [AR 示例](https://immersive-web.github.io/webxr-samples/immersive-ar-session.html) 进行测试。

## XR 模版

在做好以上准备后，可以在**编辑器主页**的**菜单视图**侧依次**点击模版**-> **XR 模版**快速创建 XR 项目。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*du7MS4eTWkgAAAAAAAAAAAAADhuCAQ/original" alt="image.png"  />

## PC 端预览

按照如下命令行构建项目，即可在 PC 端调试：

```bash
npm install
npm run https
```

随后在 Chrome 打开相应网址，即可调试 XR 项目。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*4rqLS51t6DoAAAAAAAAAAAAADhuCAQ/original" alt="image.png"  />

> WebXR 仅在安全环境（HTTPS）中可用，因此，构建项目调试时需启用 Https。

### 调试

如上文所述，在安装 `Immersive Web Emulator` 的前提下，依次 `打开开发者工具(F12)` -> `打开开发者工具(F12)`

## 手机端预览

项目没有发布上线前，我们可以让手机与电脑在同一个局域网下进行测试。

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*YGikQ6UhL5oAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

### 调试

请参考[远程调试安卓设备](https://developer.chrome.com/docs/devtools/remote-debugging?hl=zh-cn)

> 在调试前确保手机开启 **`开发者选项`** ，且允许 **`USB 调试`**

## 最佳实践

由于 XR 调试的困难，我们建议绝大部份的工作和验证在 PC 预览与调试阶段完成，这样可以显著提升开发效率。
