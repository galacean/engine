# 爆发与渐变 示例

## Summary
- 展示爆发与渐变的用法。
- 关键 API：Color

## Code
```ts
import {
  Burst,
  Color,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleGradient,
  ParticleRenderer
} from "@galacean/engine";

declare const pr: ParticleRenderer;

const { emission, colorOverLifetime, sizeOverLifetime } = pr.generator;
emission.addBurst(new Burst(0, new ParticleCompositeCurve(10, 20)));

colorOverLifetime.enabled = true;
const fade = new ParticleGradient();
fade.addColorKey(0, new Color(1, 1, 1, 1));
fade.addColorKey(1, new Color(1, 1, 1, 1));
fade.addAlphaKey(0, 1);
fade.addAlphaKey(1, 0);
colorOverLifetime.color = new ParticleCompositeGradient(fade);

sizeOverLifetime.enabled = true;
sizeOverLifetime.size.constant = 1;
```
