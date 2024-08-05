---
order: 3
title: Multi-Camera Rendering
type: Graphics
group: Camera
label: Graphics/Camera
---

In the case of multiple cameras, many customized rendering effects can be achieved by combining camera component properties such as [viewport](/apis/core/#Camera-viewport), [cullingMask](/apis/core/#Camera-cullingMask), [clearFlags](/apis/core/#Camera-clearFlags), and others.

For example, by setting the [viewport](/apis/core/#Camera-viewport), multiple cameras can render scene content in different positions on the canvas.

<playground src="multi-viewport.ts"></playground>

Another example is achieving a picture-in-picture effect by setting the [cullingMask](/apis/core/#Camera-cullingMask).

<playground src="multi-camera.ts"></playground>
