import { BoxCollider, Camera, Layer, Script, WebGLEngine } from "@galacean/engine";
import { expect, it, vi } from "vitest";
import { createPhysics } from "../../utils/physics";

it("filters DOM pointer clicks by the camera's explicit collision mask or its current culling mask", async () => {
  const canvas = document.createElement("canvas");
  canvas.style.width = "100px";
  canvas.style.height = "100px";
  document.body.appendChild(canvas);
  const engine = await WebGLEngine.create({ canvas, physics: createPhysics() });

  try {
    engine.canvas.setResolution(100, 100);
    const scene = engine.sceneManager.activeScene;
    const cameraEntity = scene.createRootEntity("camera");
    cameraEntity.transform.setPosition(0, 0, 10);
    const camera = cameraEntity.addComponent(Camera);
    const target = scene.createRootEntity("target");
    target.addComponent(BoxCollider).collisionLayer = Layer.Layer31;
    const clicked = vi.fn();
    class ClickRecorder extends Script {
      onPointerClick = clicked;
    }
    target.addComponent(ClickRecorder);
    const { left, top } = canvas.getBoundingClientRect();
    function click(): void {
      const position = { pointerId: 1, clientX: left + 50, clientY: top + 50, button: 0 };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...position, buttons: 1 }));
      engine.update();
      canvas.dispatchEvent(new PointerEvent("pointerup", { ...position, buttons: 0 }));
      engine.update();
    }

    camera.cullingMask = Layer.Layer0;
    click();
    expect(clicked).toHaveBeenCalledTimes(0);

    camera.physicsPointerMask = Layer.Layer31;
    click();
    expect(clicked).toHaveBeenCalledTimes(1);

    camera.cullingMask = Layer.Everything;
    camera.physicsPointerMask = Layer.Nothing;
    click();
    expect(clicked).toHaveBeenCalledTimes(1);

    camera.physicsPointerMask = null;
    click();
    expect(clicked).toHaveBeenCalledTimes(2);
  } finally {
    engine.destroy();
    canvas.remove();
  }
});
