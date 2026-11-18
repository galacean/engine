import { Animator, Camera, MeshRenderer, Script, WebGLEngine } from "@galacean/engine";
import { expect, it } from "vitest";

it("keeps nested update arguments and repairs indices after scripts change during dispatch", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity();
    const manager = scene._componentsManager;
    const calls: string[] = [];
    class Recorder extends Script {
      label = "";
      onUpdate(deltaTime: number): void {
        calls.push(this.label + deltaTime);
      }
    }
    class Driver extends Script {
      onUpdate(deltaTime: number): void {
        calls.push("driver" + deltaTime);
        if (deltaTime !== 1) return;
        removed.enabled = false;
        root.addComponent(Recorder).label = "added";
        manager.callScriptOnStart();
        manager.callScriptOnUpdate(2);
      }
    }
    root.addComponent(Driver);
    const removed = root.addComponent(Recorder);
    removed.label = "removed";
    const tail = root.addComponent(Recorder);
    tail.label = "tail";
    manager.callScriptOnStart();
    manager.callScriptOnUpdate(1);
    expect(calls).toEqual(["driver1", "driver2", "tail2", "added2", "tail1"]);
    calls.length = 0;
    tail.enabled = false;
    manager.callScriptOnUpdate(3);
    expect(calls).toEqual(["driver3", "added3"]);
  } finally {
    engine.destroy();
  }
});

it("delivers each camera to its scripts across nested render notifications", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const scene = engine.sceneManager.activeScene;
    const outer = scene.createRootEntity("outer").addComponent(Camera);
    const inner = scene.createRootEntity("inner").addComponent(Camera);
    inner.priority = outer.priority + 1;
    const calls: string[] = [];
    class Nested extends Script {
      onBeginRender(camera: Camera): void {
        calls.push("begin " + camera.entity.name);
        if (camera === outer) scene._componentsManager.callCameraOnBeginRender(inner);
      }
      onEndRender(camera: Camera): void {
        calls.push("end " + camera.entity.name);
      }
    }
    class Tail extends Script {
      onBeginRender(camera: Camera): void {
        calls.push("tail " + camera.entity.name);
      }
    }
    outer.entity.addComponent(Nested);
    outer.entity.addComponent(Tail);
    inner.entity.addComponent(Nested);
    engine.update();
    expect(calls).toEqual(["begin outer", "begin inner", "tail outer", "end outer", "begin inner", "end inner"]);
  } finally {
    engine.destroy();
  }
});

it("finishes deferred removals if an update callback throws", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity();
    const manager = scene._componentsManager;
    let updates = 0;
    class RemoveSelf extends Script {
      onUpdate(): void {
        this.enabled = false;
        throw new Error("script failed");
      }
    }
    class Survivor extends Script {
      onUpdate(): void {
        updates++;
      }
    }
    root.addComponent(RemoveSelf);
    const survivor = root.addComponent(Survivor);
    manager.callScriptOnStart();
    expect(() => manager.callScriptOnUpdate(1)).toThrow("script failed");
    expect(survivor._onUpdateIndex).toBe(0);
    manager.callScriptOnUpdate(1);
    survivor.enabled = false;
    manager.callScriptOnUpdate(1);
    expect(updates).toBe(1);
  } finally {
    engine.destroy();
  }
});

it("dispatches animation and renderer updates with their own receivers and time steps", async () => {
  const engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    const scene = engine.sceneManager.activeScene;
    class OnceAnimator extends Animator {
      delta = 0;
      override update(deltaTime: number): void {
        this.delta = deltaTime;
        this.enabled = false;
      }
    }
    class CountingRenderer extends MeshRenderer {
      elapsed = 0;
      override update(deltaTime: number): void {
        this.elapsed += deltaTime;
      }
    }
    const entity = scene.createRootEntity();
    const animator = entity.addComponent(OnceAnimator);
    const renderer = entity.addComponent(CountingRenderer);
    scene._componentsManager.callAnimationUpdate(0.25);
    scene._componentsManager.callRendererOnUpdate(0.5);
    scene._componentsManager.callAnimationUpdate(1);
    scene._componentsManager.callRendererOnUpdate(0.125);
    expect(animator.delta).toBe(0.25);
    expect(renderer.elapsed).toBe(0.625);
  } finally {
    engine.destroy();
  }
});
