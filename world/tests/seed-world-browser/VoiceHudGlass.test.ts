import {
  BackgroundMode, BackgroundTextureFillMode, Camera, PostProcess, Texture2D, TonemappingEffect, WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { UICanvas } from "@galacean/engine-ui";
import { expect, it } from "vitest";
import { createSeedWorldVoiceHudView } from "../../demos/seed-world/assistant/SeedWorldChatPanel";
import { resolveSeedWorldHudScale, resolveSeedWorldVoiceOrbLayout } from "../../demos/seed-world/src/SeedWorldHudLayout";

function readPixels(gl: WebGL2RenderingContext, x: number, y: number, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

function redRange(pixels: Uint8Array): [number, number] {
  let minimum = 255;
  let maximum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    minimum = Math.min(minimum, pixels[i]);
    maximum = Math.max(maximum, pixels[i]);
  }
  return [minimum, maximum];
}

it("preserves scene brightness, keeps white glyphs sharp at two densities, and transmits color to the orb rim", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity();
  const camera = root.createChild().addComponent(Camera);
  camera.enablePostProcess = true;
  root.createChild().addComponent(PostProcess).addEffect(TonemappingEffect);
  const view = createSeedWorldVoiceHudView({ engine, camera, root });
  const { layout } = view;
  const gl = canvas.getContext("webgl2")!;
  const hud = view.root.getComponent(UICanvas)!;
  const frost = () => view.resources.panelGlass.material.shaderData.getTexture("material_SeedWorldFrostTexture");
  const plate = () => {
    const panel = layout.panelTransform!;
    const scale = resolveSeedWorldHudScale(canvas.width, canvas.height);
    const em = view.transcript.fontSize * hud.referenceResolutionPerUnit / 100;
    const width = Math.floor((panel.size.x - em * 2) * scale);
    const height = Math.ceil(em * scale);
    const y = (panel.alignBottom + panel.size.y / 2) * scale;
    return readPixels(gl, Math.floor((canvas.width - width) / 2), Math.floor(y - height / 2), width, height);
  };
  function showTranscript() {
    layout.setPanelVisible(true);
    for (let i = 0; i < 4; i++) layout.onUpdate(0.1);
    engine.update();
  }

  try {
    layout.setTranscript("晴天和夜晚都要能看清文字");
    engine.update();
    for (const background of [0.55, 0]) {
      scene.background.solidColor.set(background, background, background, 1);
      layout.hidePanelImmediately();
      engine.update();
      const [sceneValue] = redRange(plate());
      view.transcript.enabled = false;
      showTranscript();
      expect(frost()).toBeTruthy();
      const backdropPixels = plate();
      const [backdrop] = redRange(backdropPixels);
      expect(Math.abs(backdrop - sceneValue)).toBeLessThanOrEqual(3);
      view.transcript.enabled = true;
      for (const working of [true, false]) {
        layout.setTranscriptWorking(working);
        engine.update();
        const pixels = plate();
        expect(redRange(pixels)[1]).toBeGreaterThan(245);
        // White glyph coverage can only brighten each backdrop channel, including at antialiased edges.
        expect(pixels.every((value, i) => i % 4 === 3 || value >= backdropPixels[i] - 1)).toBe(true);
      }
    }

    const logicalEm = view.transcript.fontSize * hud.referenceResolutionPerUnit;
    const initialSize = view.transcript.fontSize;
    const initialText = view.transcript.text;
    engine.canvas.setResolution(2048, 1280);
    engine.update();
    expect(view.transcript.fontSize).toBe(initialSize * 2);
    expect(view.transcript.fontSize * hud.referenceResolutionPerUnit).toBe(logicalEm);
    expect(view.transcript.text).toBe(initialText);
    expect(redRange(plate())[1]).toBeGreaterThan(245);
    engine.canvas.setResolution(1024, 640);
    engine.update();
    expect(view.transcript.fontSize).toBe(initialSize);

    const stripes = new Texture2D(engine, canvas.width, 1);
    const row = new Uint8Array(canvas.width * 4);
    for (let x = 0; x < canvas.width; x++) {
      const level = (x >> 2) % 2 ? 255 : 0;
      row.set([level, level, level, 255], x * 4);
    }
    stripes.setPixelBuffer(row);
    scene.background.textureFillMode = BackgroundTextureFillMode.Fill;
    scene.background.texture = stripes;
    scene.background.mode = BackgroundMode.Texture;
    layout.hidePanelImmediately();
    engine.update();
    expect(frost()).toBeFalsy();
    const sharp = redRange(plate());
    view.transcript.enabled = false;
    showTranscript();
    const blurred = redRange(plate());
    expect(sharp[1] - sharp[0]).toBeGreaterThan(100);
    expect(blurred[1] - blurred[0]).toBeLessThan((sharp[1] - sharp[0]) / 4);

    scene.background.mode = BackgroundMode.SolidColor;
    layout.hidePanelImmediately();
    layout.enabled = false;
    const { orbMaterial } = view.resources;
    const visual = view.orbEntity.findByName("Siri voice orb visual")!;
    const orb = resolveSeedWorldVoiceOrbLayout(canvas.width, canvas.height);
    const expand = orbMaterial.shaderData.getFloat("material_OrbScaleExpandPixels") ?? 0;
    const radius = (orb.orbSizePx + expand) / 2;
    const centerY = orb.orbBottomPx + orb.orbSizePx / 2;
    function readRim() {
      const pixels = readPixels(gl, 0, 0, canvas.width, canvas.height);
      return Array.from({ length: 48 }, (_, i) => {
        const angle = i / 48 * Math.PI * 2;
        const x = Math.floor(orb.orbCenterXPx + radius * 0.96 * Math.cos(angle));
        const y = Math.floor(centerY + radius * 0.96 * Math.sin(angle));
        const offset = (y * canvas.width + x) * 4;
        return pixels.subarray(offset, offset + 3);
      });
    }
    visual.isActive = false;
    engine.update();
    const bare = readRim();
    visual.isActive = true;
    engine.update();
    const rim = readRim();
    expect(rim.filter((rgb, i) => rgb.some((v, c) => Math.abs(v - bare[i][c]) > 2)).length).toBeGreaterThan(rim.length / 2);
  } finally {
    view.root.destroy();
    view.resources.destroy();
    engine.destroy();
  }
});
