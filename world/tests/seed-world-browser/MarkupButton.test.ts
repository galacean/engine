import { Camera, Script, Texture2D, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { Image } from "@galacean/engine-ui";
import { expect, it, vi } from "vitest";
import { SeedWorldCameraButton } from "../../demos/seed-world/src/SeedWorldCameraButton";
import { useLocalBasis } from "./useLocalBasis";

it("animates the pen via GPU UV uniforms with zero UI VBO uploads and keeps holds and hidden frames idle", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const scene = engine.sceneManager.activeScene;
  const camera = scene.createRootEntity("Camera").addComponent(Camera);
  const control = document.createElement("button");
  useLocalBasis();
  const button = new SeedWorldCameraButton(camera, control);
  try {
    const trigger = scene.findEntityByName("Screen markup trigger")!;
    const image = trigger.getComponent(Image)!;
    const sprite = image.sprite!;
    const material = image.getMaterial()!;
    const ticker = trigger.parent!.getComponent(Script)!;
    await vi.waitFor(() => expect(sprite.atlasRegion.width).toBeLessThan(1), { timeout: 10000 });
    expect(sprite.texture!.mipmapCount).toBe(1);
    expect(material.shader.name).toBe("SeedWorld/UIAtlasTileV1");

    // Settle initial UI chunk upload before measuring deterministic animation frames.
    engine.update();
    // Drive the animation ticker deterministically while engine.update() executes full WebGL2 overlay rendering.
    ticker.enabled = false;
    const gl = (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl;
    const upload = vi.spyOn(Texture2D.prototype, "setImageSource");
    const stroke = vi.spyOn(CanvasRenderingContext2D.prototype, "stroke");
    const tile = vi.spyOn(sprite, "atlasRegion", "set");
    const uvOffset = vi.spyOn(material.shaderData, "setVector2");
    const scale = vi.spyOn(trigger.transform, "setScale");
    const alpha = vi.spyOn(image.color, "a", "set");
    const bufferSubData = vi.spyOn(gl, "bufferSubData");
    const bufferData = vi.spyOn(gl, "bufferData");
    const tick = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        ticker.onUpdate(1 / 60);
        engine.update();
      }
    };

    tick(24);
    expect(uvOffset).not.toHaveBeenCalled();
    expect(tile).not.toHaveBeenCalled();
    expect(scale).not.toHaveBeenCalled();
    expect(alpha).not.toHaveBeenCalled();
    expect(bufferSubData).not.toHaveBeenCalled();
    expect(bufferData).not.toHaveBeenCalled();

    tick(90);
    expect(uvOffset).toHaveBeenCalled();
    const movedOffset = material.shaderData.getVector2("material_AtlasUvOffset")!;
    expect(movedOffset.x > 0 || movedOffset.y > 0).toBe(true);
    expect(tile).not.toHaveBeenCalled();
    expect(bufferSubData).not.toHaveBeenCalled();
    expect(bufferData).not.toHaveBeenCalled();

    uvOffset.mockClear();
    tick(24);
    expect(uvOffset).not.toHaveBeenCalled();

    control.hidden = true;
    tick(90);
    expect(trigger.isActive).toBe(false);
    expect(uvOffset).not.toHaveBeenCalled();

    control.hidden = false;
    tick(270);
    expect(trigger.isActive).toBe(true);
    expect(uvOffset).toHaveBeenCalled();
    expect(tile).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(stroke).not.toHaveBeenCalled();

    // Disposing mid-frame must schedule deferred force-destruction that completes at end-of-frame.
    (engine as unknown as { _frameInProcess: boolean })._frameInProcess = true;
    try {
      button.dispose();
    } finally {
      (engine as unknown as { _frameInProcess: boolean })._frameInProcess = false;
    }
    expect(material.pendingDestroy).toBe(true);
    expect(sprite.pendingDestroy).toBe(true);
    engine.update();
    expect(material.destroyed).toBe(true);
    expect(sprite.destroyed).toBe(true);
  } finally {
    vi.restoreAllMocks();
    button.dispose();
    engine.destroy();
  }
});
