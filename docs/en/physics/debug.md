---
order: 6
title: Physical Debugging
type: Physical
label: Physics
---

Physical colliders are composed of basic physical shapes, including spheres, boxes, capsules, and infinite planes. In practical applications, these collider shapes rarely perfectly align with the rendered objects, making visualization debugging quite challenging.
There are two debugging methods:
1. Using PhysX Visual Debugger (PVD), an official debugging tool developed by Nvidia. However, using this tool requires compiling the debug version of PhysX on your own and connecting the browser to the debugging tool via WebSocket.
For specific usage instructions, refer to the introduction in the [physx.js](https://github.com/galacean/physX.js) Readme.
2. We also provide a lightweight [auxiliary line tool](https://github.com/galacean/engine-toolkit/tree/main/packages/auxiliary-lines), which draws wireframes based on the configuration of physical components to assist in configuring and debugging physical components.
It is easy to use, simply attach the `WireframeManager` script and then associate it with various physical components, or directly link nodes like this:
```typescript
const wireframe = rootEntity.addComponent(WireframeManager);
wireframe.addCollideWireframe(collider);
```
<playground src="physics-debug-draw.ts"></playground>

