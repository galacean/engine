import {
  AssetType,
  Camera,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverMode as Receiver,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  Shader,
  Texture2D,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it } from "vitest";
import legacySource from "./fixtures/ssr-legacy-v2.shader?raw";
import legacyPrecompiled from "./fixtures/ssr-legacy-v2.json";

const SIZE = 64;
let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
});
afterAll(() => engine.destroy());

it.each(["source-loader", "precompiled-loader", "precompiled-direct"] as const)(
  "rejects legacy view-space V2 Surface after %s while retaining Forward rendering",
  async (route) => {
    const name = `SSRTest/LegacyViewNormalV2/${route}`;
    const data = { ...legacyPrecompiled, name } as unknown as Parameters<typeof Shader._createFromPrecompiled>[0];
    const source = legacySource.replace('Shader "SSRTest/LegacyViewNormalV2"', `Shader "${name}"`);
    const url = URL.createObjectURL(new Blob([route === "source-loader" ? source : JSON.stringify(data)]));
    const shader =
      route === "precompiled-direct"
        ? Shader._createFromPrecompiled(data)
        : await engine.resourceManager.load<Shader>({ type: AssetType.Shader, url });
    URL.revokeObjectURL(url);
    const material = new Material(engine, shader);
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.screenSpaceReflection.apply({
      activationMode: Activation.ForceOn,
      receiverPolicy: Policy.StandardPbrAuto
    });
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(0, 1.2, 6);
    camera.entity.transform.setRotation(-14, 0, 0);
    const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
    const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24);
    camera.renderTarget = target;
    const renderer = scene.createRootEntity().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createPlane(engine, 30, 30);
    renderer.setMaterial(material);
    let compatible: PBRMaterial | null = null;
    const render = () => {
      engine.update();
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      return pixels;
    };
    try {
      expect(shader.compileVariant(engine, [])).toBe(true);
      const capability = SSR.getMaterialReceiverCapability(material);
      const registered = SSR.setMaterialReceiver(material, Receiver.OpaqueComposite, 1);
      const report = [];
      for (const mode of ["On", "Auto"] as const) {
        material.screenSpaceReflection = { mode, intensity: 0.8 };
        const author = material.screenSpaceReflection;
        scene.screenSpaceReflection.activationMode = Activation.ForceOff;
        const fallback = render();
        scene.screenSpaceReflection.activationMode = Activation.ForceOn;
        const actual = render();
        const metrics = camera.screenSpaceReflection.metrics;
        report.push({
          mode,
          receiver: SSR.getMaterialReceiverMode(material),
          surfaceDraws: metrics.surfacePassDrawCount,
          tracePasses: metrics.tracePassCount,
          effective: metrics.effective,
          reason: metrics.inactiveReason,
          maxColorDelta: Math.max(...actual.map((value, i) => Math.abs(value - fallback[i])))
        });
        expect(actual.filter((value, i) => i % 4 === 2 && value > 100).length).toBeGreaterThan(100);
        expect(material.screenSpaceReflection).toEqual(author);
      }
      console.info(JSON.stringify({ route, capability, registered, report }));
      expect(capability).toEqual({
        supported: false,
        contract: "ColorResponseV2",
        unsupportedReason: "unsupported-screen-space-reflection-receiver-contract"
      });
      expect(registered).toBe(false);
      for (const state of report) {
        expect(state).toMatchObject({
          receiver: Receiver.Disabled,
          surfaceDraws: 0,
          tracePasses: 0,
          effective: false,
          reason: "no-compatible-receivers",
          maxColorDelta: 0
        });
      }
      // A valid receiver may keep SSR active. The legacy Surface must still stay out of that draw.
      compatible = new PBRMaterial(engine);
      compatible.roughness = 0.1;
      compatible.screenSpaceReflection = { mode: "On", intensity: 1 };
      const activeReceiver = scene.createRootEntity().addComponent(MeshRenderer);
      activeReceiver.mesh = PrimitiveMesh.createCuboid(engine);
      activeReceiver.entity.transform.setPosition(1, 0.6, 0);
      activeReceiver.setMaterial(compatible);
      render();
      expect(SSR.getMaterialReceiverCapability(compatible)).toMatchObject({
        supported: true,
        contract: "ColorResponseV3"
      });
      expect(camera.screenSpaceReflection.metrics.effective).toBe(true);
      expect(camera.screenSpaceReflection.metrics.surfacePassDrawCount).toBe(1);
      expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.Disabled);
    } finally {
      scene.destroy();
      target.destroy();
      output.destroy();
      material.destroy();
      compatible?.destroy();
      shader.destroy();
    }
  }
);
