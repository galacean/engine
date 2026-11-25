import { Camera, Script, Texture2D, WebGLEngine } from "@galacean/engine";
import { Image } from "@galacean/engine-ui";
import { expect, it, vi } from "vitest";
import { SeedWorldCameraButton } from "../../demos/seed-world/src/SeedWorldCameraButton";

it("animates the pen by switching atlas tiles and keeps holds and hidden frames idle", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas });
  const scene = engine.sceneManager.activeScene;
  const camera = scene.createRootEntity("Camera").addComponent(Camera);
  const control = document.createElement("button");
  const button = new SeedWorldCameraButton(camera, control);
  try {
    const trigger = scene.findEntityByName("Screen markup trigger")!;
    const sprite = trigger.getComponent(Image)!.sprite!;
    const ticker = trigger.parent!.getComponent(Script)!;
    await vi.waitFor(() => expect(sprite.atlasRegion.width).toBeLessThan(1), { timeout: 10000 });
    const upload = vi.spyOn(Texture2D.prototype, "setImageSource");
    const stroke = vi.spyOn(CanvasRenderingContext2D.prototype, "stroke");
    const tile = vi.spyOn(sprite, "atlasRegion", "set");
    const scale = vi.spyOn(trigger.transform, "setScale");
    const alpha = vi.spyOn(trigger.getComponent(Image)!.color, "a", "set");
    const tick = (frames: number) => {
      for (let i = 0; i < frames; i++) ticker.onUpdate(1 / 60);
    };

    tick(24);
    expect(tile).not.toHaveBeenCalled();
    expect(scale).not.toHaveBeenCalled();
    expect(alpha).not.toHaveBeenCalled();
    tick(90);
    expect(tile).toHaveBeenCalled();
    tile.mockClear();
    tick(24);
    expect(tile).not.toHaveBeenCalled();

    control.hidden = true;
    tick(90);
    expect(trigger.isActive).toBe(false);
    expect(tile).not.toHaveBeenCalled();
    control.hidden = false;
    tick(270);
    expect(trigger.isActive).toBe(true);
    expect(tile).toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(stroke).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    button.dispose();
    engine.destroy();
  }
});
