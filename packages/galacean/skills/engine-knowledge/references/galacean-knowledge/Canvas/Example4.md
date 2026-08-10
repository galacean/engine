# 固定宽度设计稿 示例

## Summary
- 展示固定宽度设计稿的用法。

## Code
```ts
import { WebGLEngine } from "@galacean/engine";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const engine = await WebGLEngine.create({ canvas });

const designWidth = 750;
const aspect = canvas.clientHeight / canvas.clientWidth;
engine.canvas.setResolution(designWidth, Math.round(designWidth * aspect));
```
