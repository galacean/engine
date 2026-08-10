# 基础 UI 画布与按钮 示例

## Summary
- 展示基础 UI 画布与按钮的用法。
- 关键 API：UICanvas, UITransform, Image, Button, CanvasRenderMode
- UI 运行时类来自 `@galacean/engine-ui`。SBX 中 UI 结构和序列化点击绑定仍通过当前 Editor API 创建，不要把下面的纯 Engine 示例当成 Editor payload schema。

## Code
```ts
import { Engine, Scene, Sprite } from "@galacean/engine";
import { Button, CanvasRenderMode, Image, UICanvas, UITransform } from "@galacean/engine-ui";

declare const engine: Engine;
declare const scene: Scene;
declare const sprite: Sprite;

const uiRoot = scene.createRootEntity("UIRoot");
const canvas = uiRoot.addComponent(UICanvas);
canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;

const btn = uiRoot.createChild("Button");
// UI 子节点会自动带上 UITransform，可直接调整尺寸
btn.getComponent(UITransform)?.size.set(200, 60);
const img = btn.addComponent(Image);
img.sprite = await engine.resourceManager.load<Sprite>("UI/button.sprite");

const button = btn.addComponent(Button);
button.onClick.on(() => console.log("clicked"));
```
