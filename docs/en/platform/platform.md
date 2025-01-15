---
order: 0
title: Platform Export Overview
type: Platform
label: Platform
---

In order to meet the demands of developers for launching on various platforms and truly achieve development in one place and running everywhere, Galacean 1.4 version began to support multi-platform export. Projects created by developers through the editor can be quickly exported to the projects required by different platforms.

## Prepare in Advance
After the project is developed in the editor, you can export the project for each platform and publish it. Before exporting, let's first understand the export panel and export settings.

### Export Panel
When we complete the project development and need to export it to a certain platform (taking exporting to the WechatMiniGame platform as an example), we can follow the steps below:

1、Click the Export button on the left side of the editor:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*U2RuQLwwNXIAAAAAAAAAAAAADjCHAQ/fmt.webp" />

2、On the left side of the export panel that appears, select the export platform:

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*50WSQoBlxpcAAAAAAAAAAAAADjCHAQ/fmt.webp" />

3、On the right side of the export panel are some project-related export configurations, which are mainly divided into two parts: **General configuration** (in the red box) and **Platform-related configuration** (in the yellow box):

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*aCiZTLygoQwAAAAAAAAAAAAADjCHAQ/fmt.webp"/>

### Export Configuration Instructions

The platform-related export configuration will be described separately in the platform export document. Here we focus on the **general configuration** that is independent of the platform.

| Configuration          | Describe                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Project Name | Project name. The root directory name exported to the local computer is the project name. |
| Main Scene | Project main scene |
| Engine version | The engine version number used by the project |
| Upload to CDN | Whether to upload assets to CDN |
| Texture Type | Texture type, supports KTX2 and Original:<br> **Original**：No processing is done on the texture <br> **KTX2**：Enable texture compression <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*yHPrSrhyo0sAAAAAAAAAAAAADjCHAQ/fmt.webp" /> Selecting KTX2 allows you to choose different compression formats:<br> **ETC1S：** Small size, very small memory, but low quality, suitable for albedo, specular and other textures <br> **UASTC：** Large size, high quality, suitable for normal textures <br> <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*_Ga2SKIDvv0AAAAAAAAAAAAADjCHAQ/fmt.webp" /> If the ETC1S compression format is selected, you can set the compression quality through Quality (the larger the value, the better the rendering quality):<image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*ZhviTYuo7A4AAAAAAAAAAAAADjCHAQ/fmt.webp" />|
| Tree shaking | Whether to crop the exported assets: <br>  **None:** Export all assets without cropping <br> **Current Scene:** Export only the assets used in the current scene <br> **All Scene:** Treeshaking all scenes, exporting all the assets used by the scenes <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*BJbwQrdlghwAAAAAAAAAAAAADjCHAQ/fmt.webp" />|
| WebGL Mode | Select the version to use with WebGL:<br> **Auto：** WebGL2.0 is preferred. If the operating environment does not support it, it will automatically switch to WebGL1.0 <br> **WebGL1.0：** Using WebGL1.0 <br>  **WebGL2.0：**  Using WebGL2.0 <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*HszfTJChrdEAAAAAAAAAAAAADjCHAQ/fmt.webp" />|
| Anti-Alias | Whether to enable anti-aliasing |
| Alpha | Whether the canvas supports transparent background. If you want the content below the canvas to be visible, you can turn it on. |
| Preserve Drawing Buffer | Controls whether the drawing buffer retains its contents after calling the gl.clear() method. |
| DPR Mode | [The pixel ratio of the device](/en/docs/core/canvas)，Control the size of the canvas by calling engine.canvas.resizeByClientSize: <br> **Auto：** Automatic adaptation, that is, the parameter is window.devicePixelRatio <br> **Fixed：** Developers set their own parameters <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*EQOxSI8I8awAAAAAAAAAAAAADjCHAQ/fmt.webp" /> After selecting Fixed, developers can enter the parameters they need to set. <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*-7YfTLegt_AAAAAAAAAAAAAADjCHAQ/fmt.webp" />| 

## Supported export platforms
Currently, Galacean supports exporting to the following platforms:

[Export to H5 platform](/en/docs/platform/h5/)

[Export to WeChat Mini Game Platform](/en/docs/platform/wechatMiniGame/)

