---
order: 0
title: 多平台导出总览
type: 多平台导出
label: Platform
---

为了满足广大开发者对各个平台上线的诉求，真正做到一处开发，处处运行，Galacean 1.4 版本开始支持多平台导出。开发者通过编辑器制作的项目，可以快速的导出到不同的平台所需的工程。

## 前置准备
项目在编辑器中开发完成后，就可以导出各个平台的工程并进行发布了。在导出之前，我们先来了解一下导出面板和导出设置。

### 导出面板
当我们完成项目开发，需要导出到某个平台（以导出至微信小游戏平台为例）的时候，可以按如下步骤操作：

1、点击编辑器左侧的导出按钮：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*U2RuQLwwNXIAAAAAAAAAAAAADjCHAQ/fmt.webp" />

2、在唤出的导出面板的左侧，选择导出平台：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*50WSQoBlxpcAAAAAAAAAAAAADjCHAQ/fmt.webp" />

3、导出面板的右侧为项目相关的一些导出配置，主要分为 2 块：**通用配置**（红色框内）和**平台相关配置**（黄色框内）：

<img src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*aCiZTLygoQwAAAAAAAAAAAAADjCHAQ/fmt.webp"/>

### 导出配置说明

平台相关的导出配置将在平台导出的文档里单独说明，这里重点介绍下和平台无关的**通用配置**。

| 配置          | 描述                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Project Name | 项目名称，导出到本地的根目录名就是项目名称 |
| Main Scene | 项目主场景 |
| Engine version | 项目使用的引擎版本号 |
| Upload to CDN | 是否将资产上传至 CDN |
| Texture Type | 纹理类型，支持 KTX2 和 Original：<br> **Original**：不对纹理做任何处理 <br> **KTX2**：开启纹理压缩 <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*yHPrSrhyo0sAAAAAAAAAAAAADjCHAQ/fmt.webp" /> 选择 KTX2 可以选择不同的压缩格式：<br> **ETC1S：** 尺寸小，内存极小，但是质量较低，适合 albedo, specular 等贴图 <br> **UASTC：** 尺寸大，质量高，适合 normal 这类贴图 <br> <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*_Ga2SKIDvv0AAAAAAAAAAAAADjCHAQ/fmt.webp" /> 如果选择了 ETC1S 压缩格式，可以通过 Quality 来设置压缩质量(值越大，渲染质量越好)：<image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*ZhviTYuo7A4AAAAAAAAAAAAADjCHAQ/fmt.webp" />|
| Tree shaking | 是否对导出的资产进行裁剪： <br>  **None:** 不进行裁剪，导出所有资产 <br> **Current Scene:** 只导出当前场景用到的资产 <br> **All Scene:** 对所有场景 treeshaking，导出全量场景用到的资产 <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*BJbwQrdlghwAAAAAAAAAAAAADjCHAQ/fmt.webp" />|
| WebGL Mode | 选择使用 WebGL 的版本：<br> **Auto：** 优先使用 WebGL2.0, 如果运行环境不支持自动切到 WebGL1.0 <br> **WebGL1.0：** 使用 WebGL1.0 <br>  **WebGL2.0：**  使用 WebGL2.0 <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*HszfTJChrdEAAAAAAAAAAAAADjCHAQ/fmt.webp" />|
| Anti-Alias | 是否开启抗锯齿 |
| Alpha | 画布是否支持透明背景，如果希望画布下方的内容可以透出可以开启 |
| Preserve Drawing Buffer | 用于控制在调用 gl.clear() 方法后，绘图缓冲区是否保留其内容 |
| DPR Mode | [设备的像素比](/docs/core/canvas)，通过调用 engine.canvas.resizeByClientSize 来控制画布的尺寸 <br> **Auto：** 自动适配，即参数为 window.devicePixelRatio <br> **Fixed：** 开发者自行设置参数 <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*EQOxSI8I8awAAAAAAAAAAAAADjCHAQ/fmt.webp" /> 选择 Fixed 后，开发者可以自行输入需要设置的参数 <image src="https://mdn.alipayobjects.com/huamei_w6ifet/afts/img/A*-7YfTLegt_AAAAAAAAAAAAAADjCHAQ/fmt.webp" />| 

## 支持的导出平台
目前 Galacean 支持导出的平台如下：

[导出至 H5 平台](/docs/platform/h5/)

[导出至微信小游戏平台](/docs/platform/wechatMiniGame/)

