---
order: 6
title: Physics Debugging
type: Physics
label: Physics
---

Physical colliders are composed of basic physical shapes, including spheres, boxes, capsules, and infinite planes. In practical applications, these collider shapes rarely perfectly overlap with the rendered objects, which brings significant difficulties for visual debugging.
There are two debugging methods:
1. Using the PhysX Visual Debugger (PVD), an official debugging tool developed by Nvidia. However, using this tool requires compiling the debug version of PhysX yourself and connecting the browser and the debugging tool via WebSocket.
For specific usage methods, you can refer to the introduction in the [physx.js](https://github.com/galacean/physX.js) Readme.
2. We also provide a lightweight [auxiliary line tool](https://github.com/galacean/engine-toolkit/tree/main/packages/auxiliary-lines), which draws corresponding wireframes based on the configuration of physical components to assist in configuring and debugging physical components.
It is also very easy to use, just mount the `WireframeManager` script and then set it to associate with various physical components, or directly associate with nodes:
```typescript
const wireframe = rootEntity.addComponent(WireframeManager);
wireframe.addCollideWireframe(collider);
```
<playground src="physics-debug-draw.ts"></playground>
