---
order: 0
title: 背景总览
type: 图形
group: 背景
label: Graphics/Background
---

开发者可以为场景定制背景，背景会在场景渲染前被渲染。当前 Galacean 主要有以下几种背景类型：

- [纯色背景](/docs/graphics/background/solidColor/)
- [纹理背景](/docs/graphics/background/texture/)
- [天空背景](/docs/graphics/background/sky/)

开发者可依据自己的需求设置不同的背景：

<playground src="background.ts"></playground>

在[天空盒](/docs/graphics/background/sky/)模式下，通过设置特定的网格和材质，可以实现各种定制背景，如`视频背景`：

<playground src="video-background.ts"></playground>
