# 保留原生 Canvas 句柄示例

## Summary
- 原生 Canvas 由应用创建并传给引擎；需要访问 DOM/CSS 时保留这个句柄。
- `engine.canvas` 管理渲染分辨率，不依赖内部 `_webCanvas` 字段。

## Code
```ts
import { WebGLEngine } from "@galacean/engine";

const nativeCanvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const engine = await WebGLEngine.create({ canvas: nativeCanvas });
engine.canvas.setAutoResolution();
console.log(nativeCanvas.clientWidth, nativeCanvas.clientHeight);
```
