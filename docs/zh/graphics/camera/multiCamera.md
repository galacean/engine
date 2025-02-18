---
order: 3
title: 多相机渲染
type: 图形
group: 相机
label: Graphics/Camera
---

在多个相机的情况下，通过结合相机组件的 [viewport](/apis/core/#Camera-viewport), [cullingMask](/apis/core/#Camera-cullingMask), [clearFlags](/apis/core/#Camera-clearFlags) 等属性完成许多定制化的渲染效果。

比如通过设置 [viewport](/apis/core/#Camera-viewport) 让多个相机分别在画布的不同位置渲染场景内容。

<playground src="multi-viewport.ts"></playground>

又比如通过设置 [cullingMask](/apis/core/#Camera-cullingMask) 实现画中画的效果。

<playground src="multi-camera.ts"></playground>
