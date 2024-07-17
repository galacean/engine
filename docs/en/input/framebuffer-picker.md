---
order: 4
title: Framebuffer Picking
type: Interaction
label: Interact
---

In 3D applications, it is often necessary to pick objects in the scene. [Ray bounding box](/en/docs/physics-manager#ray-detection) is a commonly used method for picking objects on the CPU, **which has good performance but poor accuracy** because bounding boxes are simple and cannot pick complex models.

When the picking frequency is low, consider using the **pixel-level accuracy** of the `FramebufferPicker` component; when the picking frequency is high, developers need to evaluate whether the performance overhead is suitable for the business scenario because this component will perform CPU-GPU communication at the underlying level, that is, calling `gl.readPixels`.

<playground src="framebuffer-picker.ts"></playground>

## Create Framebuffer Picking

```typescript
import { FramebufferPicker } from "@galacean/engine-toolkit-framebuffer-picker";

const framebufferPicker = rootEntity.addComponent(FramebufferPicker);
framebufferPicker.camera = camera;
```

## Register Picking Event

```typescript
class ClickScript extends Script {
  onUpdate(): void {
    const inputManager = this.engine.inputManager;
    if (inputManager.isPointerDown(PointerButton.Primary)) {
      const pointerPosition = inputManager.pointerPosition;
      framebufferPicker.pick(pointerPosition.x, pointerPosition.y).then((renderElement) => {
        if (renderElement) {
          // ...
        } else {
          // ...
        }
      });
    }
  }
}

cameraEntity.addComponent(ClickScript);
```
