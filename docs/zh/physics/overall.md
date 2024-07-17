---
order: 1
title: 物理总览 
type: 物理
label: Physics
---

物理引擎是游戏引擎中非常重要的组成部分。 业界普遍采用 PhysX 引入相关功能。 但是对于轻量级的场景，PhysX 使得最终的应用体积非常大，超出了这些项目的限制。 Galacean 基于多后端设计。 一方面，它通过 WebAssembly
编译得到 [PhysX.js](https://github.com/galacean/physX.js) ; 另一方面，它也提供了轻量级的物理引擎。
两者在 [API](https://github.com/galacean/engine/tree/main/packages/design/src/physics) 设计上是一致的。 用户只需要在初始化引擎时选择特定的物理后端。
可以满足轻量级应用、重量级游戏等各种场景的需求。有关物理组件的总体设计，可以参考 [Wiki](https://github.com/galacean/engine/wiki/Physical-system-design).

对于需要使用各种物理组件，以及 `InputManager` 等需要 Raycast 拾取的场景，都需要在使用之前初始化物理引擎。目前 Galacean 引擎提供两种内置的物理引擎后端实现：

 - [physics-lite](https://github.com/galacean/engine/tree/main/packages/physics-lite)
 - [physics-physx](https://github.com/galacean/engine/tree/main/packages/physics-physx)

开发者可以在 [主菜单](/docs/interface-menu) 界面打开的 **项目设置** 面板中设置物理后端。

![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*LO_FRIsaIzIAAAAAAAAAAAAADsJ_AQ/original)
![alt text](https://mdn.alipayobjects.com/huamei_3zduhr/afts/img/A*ZvWdQqEfIKoAAAAAAAAAAAAADsJ_AQ/original)

若通过脚本初始化引擎，只需要将物理后端对象传入 `Engine` 中即可：

```typescript
import {LitePhysics} from "@galacean/engine-physics-lite";

const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  physics: new LitePhysics(),
});
```

## PhysX 版物理引擎加载与初始化

```typescript
import { PhysXPhysics } from "@galacean/engine-physics-physx";

const engine = await WebGLEngine.create({
  canvas: htmlCanvas,
  physics: new PhysXPhysics(),
});
```

## 选择物理后端
选择物理后端需要考虑到功能，性能和包尺寸这三个因素：
1. 功能：追求完整物理引擎功能以及高性能的物理模拟，推荐选择 PhysX 后端，Lite 后端只支持碰撞检测。
2. 性能：PhysX 会在不支持 WebAssembly 的平台自动降级为纯 JavaScript 的代码，因此性能也会随之降低。但由于内置了用于场景搜索的数据结构，性能比 Lite 后端还是要更加好。
3. 包尺寸：选择 PhysX 后端会额外引入接近 2.5mb 的 wasm 文件（纯 JavaScript 版的大小接近），增加包的大小的同时降低应用初始化的速度。
