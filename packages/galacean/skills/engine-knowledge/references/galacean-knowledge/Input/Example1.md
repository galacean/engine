# 初始化输入 示例

## Summary
- 展示初始化输入的用法。
- 关键 API：WebGLEngine

## Code
```ts
import { WebGLEngine } from "@galacean/engine";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const engine = await WebGLEngine.create({
  canvas,
  input: { pointerTarget: document, keyboardTarget: document, wheelTarget: document }
});
```
