import riverShaderTemplate from "../../water/src/water/shaders/RiverWater.shader?raw";
import heightfieldShaderTemplate from "../../water/src/water/shaders/HeightfieldWater.shader?raw";
import {
  AssetType,
  Camera,
  Material,
  Scene,
  Shader,
  ShaderLanguage,
  WebGLEngine,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Mode,
  ScreenSpaceReflectionSettingsSource as Source,
  ScreenSpaceReflectionReceiverMode as Receiver,
  RenderQueueType
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
let engine: WebGLEngine;
const urls: string[] = [];
function url(data: unknown) {
  const u = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  urls.push(u);
  return u;
}
beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), shaderCompiler: new ShaderCompiler() });
});
afterAll(() => {
  engine.destroy();
  urls.forEach(URL.revokeObjectURL);
});

it("CR-001 loaded legacy material retains runtime registration; explicit author settings reject runtime takeover", async () => {
  const shader = Shader.create("ReviewSurfaceOnly", [...Shader.find("PBR")!.subShaders])!;
  const load = (screenSpaceReflection?: unknown) =>
    engine.resourceManager.load<Material>({
      type: AssetType.Material,
      url: url({ name: "review", shader: shader.name, shaderData: {}, macros: [], screenSpaceReflection })
    });
  const legacy = await load();
  expect(SSR.setMaterialReceiver(legacy, Receiver.OpaqueComposite, 0.7)).toBe(true);
  expect(SSR.getMaterialReceiverMode(legacy)).toBe(Receiver.OpaqueComposite);
  expect(legacy.shaderData.getFloat("material_ScreenSpaceReflectionIntensity")).toBe(0.7);
  expect(SSR.setMaterialReceiver(legacy, Receiver.Disabled)).toBe(true);
  expect(SSR.getMaterialReceiverMode(legacy)).toBe(Receiver.Disabled);
  expect(SSR.setMaterialReceiver(legacy, Receiver.OpaqueComposite, 0.3)).toBe(true);
  expect(SSR.getMaterialReceiverMode(legacy)).toBe(Receiver.OpaqueComposite);
  const authored = await load({ mode: "Off", intensity: 0.6 });
  expect(SSR.setMaterialReceiver(authored, Receiver.OpaqueComposite, 0.7)).toBe(false);
  expect(SSR.getMaterialReceiverMode(authored)).toBe(Receiver.Disabled);
  authored.screenSpaceReflection = { mode: "On", intensity: 0.6 };
  expect(SSR.setMaterialReceiver(authored, Receiver.Disabled)).toBe(false);
  expect(SSR.getMaterialReceiverMode(authored)).toBe(Receiver.OpaqueComposite);
  legacy.destroy();
  authored.destroy();
});
it("CR-002 complete snapshot restores never-initialized overrides and copies the current scene next time", () => {
  const scene = new Scene(engine);
  const camera = scene.createRootEntity().addComponent(Camera);
  const initial = JSON.parse(JSON.stringify(camera.screenSpaceReflectionSettings));
  camera.screenSpaceReflectionSettings = { settingsSource: Source.Override, overrideSettings: { intensity: 0.3 } };
  camera.screenSpaceReflectionSettings = initial;
  expect(camera.screenSpaceReflectionSettings.overrideSettings).toBeUndefined();
  scene.screenSpaceReflection.intensity = 0.8;
  camera.screenSpaceReflection.settingsSource = Source.Override;
  expect(camera.screenSpaceReflection.intensity).toBe(0.8);
  const saved = camera.screenSpaceReflectionSettings;
  camera.screenSpaceReflection.intensity = 0.1;
  camera.screenSpaceReflectionSettings = saved;
  expect(camera.screenSpaceReflection.intensity).toBe(0.8);
  scene.destroy();
});
it("CR-003 a renamed PBR surface cannot promise transparent Forward sampling", () => {
  const shader = Shader.create("ReviewRenamedPBR", [...Shader.find("PBR")!.subShaders])!;
  const mat = new Material(engine, shader);
  mat.screenSpaceReflection = { mode: "On", intensity: 0.5 };
  expect(SSR.getMaterialReceiverMode(mat, RenderQueueType.Opaque)).toBe(Receiver.OpaqueComposite);
  expect(SSR.getMaterialReceiverMode(mat, RenderQueueType.Transparent)).toBe(Receiver.Disabled);
  const runtime = new Material(engine, shader);
  expect(SSR.setMaterialReceiver(runtime, Receiver.TransparentSampleOnly)).toBe(false);
  mat.destroy();
  runtime.destroy();
});
it("CR-003 a Forward implementation with explicit sampling declaration compiles and registers", () => {
  const sampling = Shader.create(
    `Shader "ReviewSampling" { SubShader "Default" { Pass "Forward" {
    Tags { pipelineStage = "Forward", screenSpaceReflectionTransparentSample = "SampleV1" }
    sampler2D camera_ScreenSpaceReflectionTexture;
    float camera_ScreenSpaceReflectionIntensity;
    struct Attributes { vec3 POSITION; };
    struct Varyings { vec2 uv; };
    VertexShader = vert; FragmentShader = frag;
    Varyings vert(Attributes v) { Varyings output; output.uv = v.POSITION.xy * 0.5 + 0.5; gl_Position = vec4(v.POSITION, 1.0); return output; }
    void frag(Varyings input) { gl_FragColor = texture2D(camera_ScreenSpaceReflectionTexture, input.uv) * camera_ScreenSpaceReflectionIntensity; }
  } } }`,
    ShaderLanguage.GLSLES300
  )!;
  expect(sampling).toBeDefined();
  expect(sampling.compileVariant(engine, [])).toBe(true);
  const surface = Shader.find("PBR")!.subShaders[0].passes.filter(
    (p) => p.getTagValue("pipelineStage") === "ScreenSpaceReflectionSurface"
  );
  const shader = Shader.create("ReviewCompleteReceiver", [...sampling.subShaders[0].passes, ...surface])!;
  const mat = new Material(engine, shader);
  mat.screenSpaceReflection = { mode: "On", intensity: 0.5 };
  expect(SSR.getMaterialReceiverMode(mat, RenderQueueType.Transparent)).toBe(Receiver.TransparentSampleOnly);
  const runtime = new Material(engine, shader);
  expect(SSR.setMaterialReceiver(runtime, Receiver.TransparentSampleOnly, 0.6)).toBe(true);
  expect(SSR.getMaterialReceiverMode(runtime)).toBe(Receiver.TransparentSampleOnly);
  runtime.destroy();
  mat.destroy();
});
it("CR-004 Loader and runtime assignment inherit the same configured Scene for partial overrides", async () => {
  const settings = { settingsSource: Source.Override, overrideSettings: { intensity: 0.4 } };
  const loaded = await engine.resourceManager.load<Scene>({
    type: AssetType.Scene,
    url: url({
      version: "2.0",
      refs: [],
      entities: [{ components: [0] }],
      components: [{ type: "Camera", props: { screenSpaceReflectionSettings: settings } }],
      scene: {
        rootEntities: [0],
        background: { mode: 0, color: [0, 0, 0, 1] },
        screenSpaceReflection: { activationMode: Mode.ForceOn, maxRaySteps: 16 }
      }
    })
  });
  const runtime = new Scene(engine);
  runtime.screenSpaceReflection.apply({ activationMode: Mode.ForceOn, maxRaySteps: 16 });
  const camera = runtime.createRootEntity().addComponent(Camera);
  camera.screenSpaceReflectionSettings = settings;
  expect(loaded.rootEntities[0].getComponent(Camera)!.screenSpaceReflectionSettings).toEqual(
    camera.screenSpaceReflectionSettings
  );
  loaded.destroy();
  runtime.destroy();
});
it("CR-005 diagnostic reads never resolve or write ShaderData, including disabled and destroyed cameras", () => {
  const scene = new Scene(engine);
  const c = scene.createRootEntity().addComponent(Camera);
  const ssr = c.screenSpaceReflection;
  const setFloat = vi.spyOn(c.shaderData, "setFloat");
  const setTexture = vi.spyOn(c.shaderData, "setTexture");
  const resolve = vi.spyOn(ssr as any, "_resolveSettings");
  for (let i = 0; i < 4; i++) {
    void ssr.metrics;
    ssr.getResolvedSettings(Receiver.OpaqueComposite);
    ssr.getReceiverTraceSettingsOverride(Receiver.TransparentSampleOnly);
  }
  expect(resolve).not.toHaveBeenCalled();
  expect(setFloat).not.toHaveBeenCalled();
  expect(setTexture).not.toHaveBeenCalled();
  scene.screenSpaceReflection.activationMode = Mode.ForceOn;
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(true);
  setFloat.mockClear();
  setTexture.mockClear();
  resolve.mockClear();
  ssr._prepareSettings();
  void ssr.metrics;
  expect(resolve).not.toHaveBeenCalled();
  expect(setFloat).not.toHaveBeenCalled();
  expect(setTexture).not.toHaveBeenCalled();
  const other = new Scene(engine);
  other.screenSpaceReflection.intensity = 0.2;
  other.addRootEntity(c.entity);
  ssr._prepareSettings();
  expect(ssr.metrics.resolvedSettings.intensity).toBe(0.2);
  const lease = ssr.acquireConsumer("review", { intensity: 0.3 });
  expect(ssr.metrics.requested).toBe(true);
  expect(ssr.metrics.resolvedSettings.intensity).toBe(0.3);
  lease.release();
  expect(ssr.metrics.requested).toBe(false);
  other.destroy();
  expect(() => ssr.metrics).not.toThrow();
  setFloat.mockRestore();
  setTexture.mockRestore();
  resolve.mockRestore();
  scene.destroy();
});

it.each([
  ["river", riverShaderTemplate],
  ["heightfield", heightfieldShaderTemplate]
])("CR-003 %s water ShaderLab preserves the Forward capability declaration", (_name, template) => {
  const source = template
    .replace(/\{\{VALUE_181_CREATERIVERSCREENSPACEREFLECTIONSURFACEPASS\}\}/g, "")
    .replace(/\{\{VALUE_094_SCREENSPACEREFLECTIONSURFACEPASS_QUALITY_WAVECOUNT_SURFA\}\}/g, "")
    .replace(/\{\{[^}]+\}\}/g, "Review");
  const parsed = new ShaderCompiler()._parseShaderSource(source);
  const tags = parsed.subShaders[0].passes[0].tags;
  expect(tags).toMatchObject({ pipelineStage: "Forward", screenSpaceReflectionTransparentSample: "SampleV1" });
});
