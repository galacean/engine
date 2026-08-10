# 基础粒子 示例

## Summary
- 展示基础粒子的用法。
- 关键 API：ParticleRenderer, ParticleRenderMode, ParticleSimulationSpace

## Code
```ts
import { Entity, ParticleRenderMode, ParticleRenderer, ParticleSimulationSpace } from "@galacean/engine";

declare const entity: Entity;

const pr = entity.addComponent(ParticleRenderer);
const { main, emission } = pr.generator;
main.duration = 2;
main.isLoop = true;
main.simulationSpace = ParticleSimulationSpace.Local;
main.startSpeed.constant = 2;
main.startLifetime.constant = 1.5;
main.startSize.constant = 0.2;

emission.rateOverTime.constant = 20;
pr.renderMode = ParticleRenderMode.Billboard;
pr.generator.play();
```
