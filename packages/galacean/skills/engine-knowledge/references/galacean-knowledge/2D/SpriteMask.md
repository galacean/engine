# SpriteMask 示例

## Summary
- 在场景中创建遮罩组件并指定 `Sprite` 作为遮罩形状。
- 调整 `alphaCutoff` 与 `influenceLayers` 控制遮罩范围。
- 配合目标渲染器的 `maskInteraction` 与 `maskLayer` 使遮罩生效。

## Code
```ts
import { Entity, Sprite, SpriteMask, SpriteMaskInteraction, SpriteMaskLayer, SpriteRenderer } from "@galacean/engine";

declare const root: Entity;
declare const sprite: Sprite;
declare const renderer: SpriteRenderer;

const mask = root.createChild("Mask").addComponent(SpriteMask);
mask.sprite = sprite;
mask.alphaCutoff = 0.5;
mask.influenceLayers = SpriteMaskLayer.Layer0;

renderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
renderer.maskLayer = SpriteMaskLayer.Layer0;
```
