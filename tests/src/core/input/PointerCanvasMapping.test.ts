import { PointerPhase, WebGLEngine } from "@galacean/engine";
import { expect, it, vi } from "vitest";

it("reads current canvas bounds once per input batch and cleans up pointers on idle frames", async () => {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;left:10px;top:15px;width:50px;height:50px";
  document.body.appendChild(canvas);
  const engine = await WebGLEngine.create({ canvas });
  const manager = engine.inputManager["_pointerManager"];
  const send = (type: string, pointerId: number, clientX: number, clientY: number) =>
    manager._target.dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY, buttons: 1 }));
  const bounds = vi.spyOn(canvas, "getBoundingClientRect");
  try {
    engine.canvas.setResolution(100, 100);
    manager._update();
    expect(bounds).toHaveBeenCalledTimes(0);
    send("pointerdown", 11, 15, 21);
    send("pointerdown", 12, 20, 25);
    manager._update();
    expect(bounds).toHaveBeenCalledTimes(1);
    const [first, second] = engine.inputManager.pointers;
    expect([first.position.x, first.position.y, second.position.x, second.position.y]).toEqual([10, 12, 20, 20]);

    canvas.style.left = "30px";
    canvas.style.width = "25px";
    manager._update();
    expect(bounds).toHaveBeenCalledTimes(1);
    expect(first.phase).toBe(PointerPhase.Stationary);
    expect([first.position.x, first.position.y, first.deltaPosition.x, first.deltaPosition.y]).toEqual([10, 12, 0, 0]);
    send("pointermove", 11, 36, 23);
    send("pointercancel", 12, 35, 24);
    manager._update();
    expect(bounds).toHaveBeenCalledTimes(2);
    expect([first.position.x, first.position.y, first.deltaPosition.x, first.deltaPosition.y]).toEqual([24, 16, 14, 4]);
    expect(second.phase).toBe(PointerPhase.Leave);
    manager._update();
    expect(bounds).toHaveBeenCalledTimes(2);
    expect(engine.inputManager.pointers).toEqual([first]);
  } finally {
    bounds.mockRestore();
    engine.destroy();
    canvas.remove();
  }
});
