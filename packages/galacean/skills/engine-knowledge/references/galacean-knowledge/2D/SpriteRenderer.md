# SpriteRenderer 示例

## Summary
- 加载 2D 纹理并创建 `Sprite`。
- 在子实体上挂载 `SpriteRenderer`，启用九宫格渲染并设置颜色。
- 适用于按钮等 UI 元素的精灵绘制。

## Code
```ts
import { AssetType, Engine, Entity, Sprite, SpriteDrawMode, SpriteRenderer, Texture2D } from "@galacean/engine";

declare const engine: Engine;
declare const root: Entity;

const tex = await engine.resourceManager.load<Texture2D>({ type: AssetType.Texture, url: "UI/button.png" });
const sprite = new Sprite(engine, tex);

const entity = root.createChild("Button");
const renderer = entity.addComponent(SpriteRenderer);
renderer.sprite = sprite;
renderer.drawMode = SpriteDrawMode.Sliced; // 九宫格
renderer.color.set(1, 1, 1, 0.9);
```
