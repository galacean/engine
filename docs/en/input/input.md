---
order: 0
title: Interaction Overview
type: Interaction
label: Interact
---

Galacean provides a basic input system. Based on cross-end and cross-platform features, the interaction system is well compatible with both PC and mobile ends. The current interaction system can accept the following inputs:

- [Touch](/en/docs/input/pointer/)
- [Keyboard](/en/docs/input/keyboard/)
- [Wheel](/en/docs/input/wheel/)

## Initialization

When initializing the engine, you can customize the listening sources for **touch**, **keyboard**, and **wheel**.

<img src="https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*GbQ_QLO0kjYAAAAAAAAAAAAADhuCAQ/original" alt="image.png" style="zoom:100%;" />

```typescript
// 将触控事件的监听源设置为 document
const engine = await WebGLEngine.create({
  canvas,
  input: {
    pointerTarget: document,
  },
});
```

> ⚠️ Do not set the listening source of touch to `window`, because `window` cannot receive `PointerLevel` events, which will cause touch information confusion.

> ⚠️ If you set the listening source of the keyboard to a certain `HtmlElement`, you need to set its `tabIndex` so that it can be focused. For example, you can call `canvas.tabIndex = canvas.tabIndex;` once.

## Framebuffer Picking

If the engine's [touch callback](/en/docs/input/pointer/#触控回调) cannot meet your needs, you can try using [framebuffer picking](/en/docs/input/framebuffer-picker/)

