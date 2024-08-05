---
order: 1
title: Canvas
group: Basics
label: Core
---

The Galacean Engine encapsulates canvases for different platforms, such as [WebCanvas](/en/apis/rhi-webgl/WebCanvas), supporting control of [HTMLCanvasElement](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement) or [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) using [Engine](/en/apis/core/#Engine).

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*ZC9gRY-KCTgAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

> Unless otherwise specified, the canvas in the documentation generally refers to `WebCanvas`.

## Basic Usage

### Creating a Canvas

Insert a `<canvas>` tag in HTML and specify an id:

```html
<canvas id="canvas" style="width: 500px; height: 500px" />
```

> Developers should check the height and width of the canvas to avoid rendering issues caused by a height or width value of **0**.

When creating an instance of WebGLEngine, a WebCanvas instance is automatically created. The parameter `canvas` is the `id` of the _Canvas_ element.

```typescript
const engine = await WebGLEngine.create({ canvas: "canvas" });

console.log(engine.canvas); // => WebCanvas instance
```

### Basic Adaptation

The canvas size is generally controlled by the **device pixel ratio**. Taking [WebCanvas](/en/apis/rhi-webgl/WebCanvas) as an example:

```mermaid
flowchart TD
    A[HtmlCanvas.clientWidth] -->|pixelRatio| B[WebCanvas.width]
    C[HtmlCanvas.clientHeight] -->|pixelRatio| D[WebCanvas.height]
```

If developing by exporting an **NPM package** through the editor, you only need to control the **device pixel ratio** in the [project export](/en/docs/assets/build) rendering export configuration.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*afw5QrbrxkQAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:50%;" />

Or actively call `resizeByClientSize` in the code to adapt the canvas.

```typescript
// 使用设备像素比（ window.devicePixelRatio ）调整画布尺寸，
engine.canvas.resizeByClientSize();
// 自定义像素比调整画布尺寸
engine.canvas.resizeByClientSize(1.5);
```

> When the display size of the canvas changes (such as when the browser window changes), the image may appear stretched or compressed. You can call `resizeByClientSize` to restore it to normal. Generally, this line of code can meet the adaptation needs. If you have more complex adaptation requirements, please read the "Advanced Usage" section.

## Advanced Usage

Regarding adaptation, the core point to note is the **device pixel ratio**. Taking iPhoneX as an example, the device pixel ratio `window.devicePixelRatio` is _3_, the window width `window.innerWidth` is _375_, and the screen physical pixel width is: 375 * 3 = *1125*.

Rendering pressure is proportional to the physical pixel height and width of the screen. The larger the physical pixels, the greater the rendering pressure, and the more power it consumes. It is recommended to set the height and width of the canvas through the API exposed by [WebCanvas](/en/apis/rhi-webgl/WebCanvas), rather than using the native canvas API, such as `canvas.width` or `canvas.style.width`.

> ️ **Note**: Some front-end scaffolds will insert the following tag to modify the page zoom ratio:
>
> `<meta name="viewport" content="width=device-width, initial-scale=0.333333333">`
>
> This line of code will change the value of `window.innerWidth` from 375 to 1125.

除了 `resizeByClientSize` 自动适配，推荐使用以下两种模式：

### 节能模式

考虑到移动端设备虽然是高清屏幕（设别像素比高）但实际显卡性能并不能很好地满足高清实时渲染的性能要求的情况（**3 倍屏和 2 倍屏渲染面积比是 9:4，3 倍屏较容易造成手机发烫**），此模式下引擎通过对画布缩放拉伸来达到适配的目的。代码如下：

```typescript
const canvas = document.getElementById("canvas");
const webcanvas = new WebCanvas(canvas);
const pixelRatio = window.devicePixelRatio; // 如果已经设置 meta scale，请设置为 1
const scale = 3 / 2; // 3 倍高清屏按 2 倍屏来计算画布尺寸

/**
 * 设置节能模式，默认全屏，也可以自己设置任意高宽
 */
webcanvas.width = (window.innerWidth * pixelRatio) / scale;
webcanvas.height = (window.innerHeight * pixelRatio) / scale;
webcanvas.setScale(scale, scale); // 拉伸画布
```

如果已经通过 CSS 设置了画布高宽（比如 `width: 100vw; height: 100vh;`），那么可以通过 `resizeByClientSize` 传参实现画布的缩放：

```typescript
const canvas = document.getElementById("canvas");
const webcanvas = new WebCanvas(canvas);
const scale = 2 / 3; // 3 倍高清屏按 2 倍屏来计算画布尺寸

webcanvas.resizeByClientSize(scale); // 拉伸画布
```

### 固定宽度模式

某些情况下，比如设计稿固定 750 宽度的情况，开发者有可能会写死画布宽度来降低适配成本。代码如下：

```typescript
import { WebCanvas } from "@galacean/engine";

const canvas = document.getElementById("canvas");
const webcanvas = new WebCanvas(canvas);
const fixedWidth = 750; // 固定 750 宽度

/**
 * 设置固定宽度模式
 */
const scale = window.innerWidth / fixedWidth;
webcanvas.width = fixedWidth;
webcanvas.height = window.innerHeight / scale;
webcanvas.setScale(scale, scale); // 拉伸画布
```
