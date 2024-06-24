---
order: 6
title: 物理调试
type: 物理
label: Physics
---

物理碰撞器由基础物理外形复合而成，包括了球，盒，胶囊和无限大的平面。在实际应用中，这些碰撞器外形很少与渲染的物体刚好是完全重合的，这为可视化调试带来了很大的困难。
有两种调试方法：
1. 借助 PhysX Visual Debugger(PVD)，是 Nvidia 官方开发的调试工具，但是用这一工具需要自行编译 debug 版本的PhysX，并且借助 WebSocket 串联浏览器和该调试工具。
具体的使用方法，可以参考 [physx.js](https://github.com/galacean/physX.js) 的Readme种的介绍。
2. 我们还提供了轻量级的[辅助线工具](https://github.com/galacean/engine-toolkit/tree/main/packages/auxiliary-lines)，该工具根据物理组件的配置绘制对应的线框，辅助配置和调试物理组件。
使用起来也非常容易，只需要在挂载 `WireframeManager` 脚本，然后设置其关联各种物理组件，或者直接关联节点即可：
```typescript
const wireframe = rootEntity.addComponent(WireframeManager);
wireframe.addCollideWireframe(collider);
```
<playground src="physics-debug-draw.ts"></playground>
