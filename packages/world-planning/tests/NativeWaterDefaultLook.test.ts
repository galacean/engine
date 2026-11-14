import { expect, it } from "vitest";
import {
  AssetType,
  BlinnPhongMaterial,
  BufferAsset,
  Camera,
  Color,
  DirectLight,
  JSONAsset,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  TextureCube,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  createWaterCreationPreset,
  createWaterQualitySettings,
  encodeWaterTerrainAssets,
  registerNativeWater,
  WaterBodyComponent,
  WaterSystem
} from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import baseline from "./fixtures/water-default-look/provenance.json";

const images = {
  "lake-near": new URL("./fixtures/water-default-look/lake-near.png", import.meta.url).href,
  "river-near": new URL("./fixtures/water-default-look/river-near.png", import.meta.url).href,
  "ocean-near": new URL("./fixtures/water-default-look/ocean-near.png", import.meta.url).href,
  "ocean-transition": new URL("./fixtures/water-default-look/ocean-transition.png", import.meta.url).href,
  "ocean-far": new URL("./fixtures/water-default-look/ocean-far.png", import.meta.url).href
};
type View = keyof typeof images;

async function referencePixels(view: View) {
  const response = await fetch(images[view]);
  expect(response.ok).toBe(true);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""), view).toBe(
    baseline.views[view].sha256
  );
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  try {
    expect([bitmap.width, bitmap.height]).toEqual([baseline.width, baseline.height]);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  } finally {
    bitmap.close();
  }
}

function difference(actual: Uint8Array, expected: Uint8ClampedArray) {
  expect(actual.length).toBe(baseline.width * baseline.height * 4);
  expect(expected.length).toBe(actual.length);
  let total = 0,
    changed = 0;
  for (let y = 0; y < baseline.height; y++) {
    for (let x = 0; x < baseline.width; x++) {
      let maximum = 0;
      // WebGL readPixels is bottom-up; PNG decoding is top-down.
      const a = ((baseline.height - y - 1) * baseline.width + x) * 4;
      const b = (y * baseline.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs(actual[a + channel] - expected[b + channel]);
        total += delta;
        maximum = Math.max(maximum, delta);
      }
      if (maximum > 8) changed++;
    }
  }
  return {
    mean: total / (baseline.width * baseline.height * 3),
    changed: changed / (baseline.width * baseline.height)
  };
}

it.each(["lake", "river", "ocean"] as const)(
  "preserves the independent historical %s default look across its captured views",
  async (kind) => {
    registerNativeWater();
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const engine = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { preserveDrawingBuffer: true }
    });
    let system: WaterSystem | undefined;
    try {
      engine.time.timeScale = baseline.fixedTime;
      engine.canvas.setResolution(baseline.width, baseline.height);
      const scene = engine.sceneManager.activeScene;
      scene.background.solidColor = new Color(0.4, 0.6, 0.8, 1);
      const camera = scene.createRootEntity("Camera").addComponent(Camera);
      camera.nearClipPlane = 0.1;
      camera.farClipPlane = 20000;
      const sun = scene.createRootEntity("Sun").addComponent(DirectLight);
      sun.entity.transform.setRotation(-60, 20, 0);
      sun.intensity = 1.5;
      scene.sun = sun;
      const environment = new TextureCube(engine, 32, TextureFormat.R8G8B8A8, true, false);
      for (let face = 0; face < 6; face++) {
        const pixels = new Uint8Array(32 * 32 * 4);
        for (let y = 0; y < 32; y++)
          for (let x = 0; x < 32; x++) {
            const i = (y * 32 + x) * 4;
            pixels.set([40 + face * 20, 40 + y * 5, 80 + x * 5, 255], i);
          }
        environment.setPixelBuffer(face, pixels);
      }
      environment.generateMipmaps();
      scene.ambientLight.specularTexture = environment;
      scene.ambientLight.specularIntensity = 0.8;
      const ground = scene.createRootEntity("Visible bed");
      ground.transform.setPosition(0, -0.15, 0);
      const renderer = ground.addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createPlane(engine, 100, 100);
      const bedMaterial = new BlinnPhongMaterial(engine);
      bedMaterial.baseColor.set(0.55, 0.48, 0.3, 1);
      renderer.setMaterial(bedMaterial);
      system = scene.createRootEntity("Water").addComponent(WaterSystem);
      system.camera = camera;
      const preset = createWaterCreationPreset(kind);
      const shape = preset.shape.kind === "river" ? { ...preset.shape, speed: 1 } : preset.shape;
      const encoded = encodeWaterTerrainAssets(preset.terrain);
      const description = new JSONAsset(engine),
        heights = new BufferAsset(engine);
      description.data = encoded.description;
      heights.buffer = encoded.heights.buffer;
      const manifest: { files: Parameters<typeof engine.resourceManager.registerVirtualResources>[0] } = await (
        await fetch(BUILTIN_WATER_PROJECT_URL)
      ).json();
      // A changed default image is also an appearance change and needs explicit review.
      await Promise.all(
        baseline.textures.map(async (texture) => {
          const response = await fetch(new URL(texture.path, BUILTIN_WATER_PROJECT_URL));
          expect(response.ok).toBe(true);
          const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
          expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")).toBe(
            texture.sha256
          );
        })
      );
      engine.resourceManager.registerVirtualResources(
        manifest.files.map((file) => ({
          ...file,
          path: new URL(file.path, BUILTIN_WATER_PROJECT_URL).href
        }))
      );
      const material = await engine.resourceManager.load<Material>({
        url: new URL(`Water/Materials/${kind}.mat`, BUILTIN_WATER_PROJECT_URL).href,
        type: AssetType.Material
      });
      const body = scene.createRootEntity(kind).addComponent(WaterBodyComponent);
      body.authoring = {
        shape,
        terrain: { mode: "asset", description, heights },
        material,
        quality: createWaterQualitySettings(kind)
      };
      await body.ready;
      await system.ready;
      const gl = canvas.getContext("webgl2")!;
      const render = () => {
        engine.update();
        expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBeNull();
        const pixels = new Uint8Array(baseline.width * baseline.height * 4);
        gl.readPixels(0, 0, baseline.width, baseline.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        expect(gl.getError()).toBe(0);
        return pixels;
      };
      const views = Object.keys(images).filter((name) => name.startsWith(`${kind}-`)) as View[];
      for (const view of views) {
        const [x, y, z, tx, ty, tz] = baseline.views[view].camera;
        camera.entity.transform.setPosition(x, y, z);
        camera.entity.transform.lookAt(new Vector3(tx, ty, tz));
        for (let frame = 0; frame < 5; frame++) render();
        const pixels = render();
        expect(render()).toEqual(pixels);
        const expected = await referencePixels(view);
        const delta = difference(pixels, expected);
        // Small driver/edge variation is allowed; broad shading changes are not.
        expect(delta.mean, view).toBeLessThanOrEqual(1);
        expect(delta.changed, view).toBeLessThanOrEqual(0.01);
        // Every reference must contain enough water to reject a missing surface.
        const configuration = body.configuration!;
        await (await system.prepareBatch([{ body, configuration: { ...configuration, visible: false } }])).commit()
          .retiredCleanup;
        const hidden = difference(render(), expected);
        expect(hidden.mean > 1 || hidden.changed > 0.01, `${view}: the reference must detect missing water`).toBe(true);
        await (await system.prepareBatch([{ body, configuration }])).commit().retiredCleanup;
      }
    } finally {
      await system?.dispose();
      engine.destroy();
      canvas.remove();
    }
  },
  120000
);
