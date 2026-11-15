import {
  Camera,
  FogMode,
  GLCapabilityType,
  Material,
  MeshRenderer,
  ModelMesh,
  Ray,
  PBRMaterial,
  PrimitiveMesh,
  RenderQueueType,
  RenderTarget,
  Scene,
  Shader,
  ShaderLanguage,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  TextureFilterMode,
  Vector2,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readTraceTarget } from "./ScreenSpaceReflectionTraceReadback";
import legacySource from "./fixtures/ssr-legacy-v2.shader?raw";
import surfaceSource from "../src/native/shader/src/Shaders/Pipeline/ScreenSpaceReflectionSurface.shader?raw";

function maxByteDelta(a: Uint8Array, b: Uint8Array): number {
  let delta = 0;
  for (let i = 0; i < a.length; i++) delta = Math.max(delta, Math.abs(a[i] - b[i]));
  return delta;
}

let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const gl = engine._hardwareRenderer.gl;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  console.info(
    JSON.stringify({ backend: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) })
  );
});

const SIZE = 128;
interface PassInternals {
  _surfaceTarget: RenderTarget;
  _traceTarget: RenderTarget;
  _filteredTraceTarget: RenderTarget;
  _material: Material;
}

/** Read actual Surface MRTs; inject only radiance for isolated Composite replacement checks. */
function fixture(samples = 1) {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.StandardPbrAuto,
    maxRoughness: 0.6,
    resolutionScale: 1,
    upsamplingMode: Upsampling.Bilinear,
    edgeFade: 0
  });
  scene.ambientLight.diffuseIntensity = 0;
  const environment = new TextureCube(engine, 1, TextureFormat.R8G8B8A8, false);
  for (let face = 0; face < 6; face++) {
    environment.setPixelBuffer(face as TextureCubeFace, new Uint8Array([255, 255, 255, 255]));
  }
  scene.ambientLight.specularTexture = environment;
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.enableHDR = false;
  camera.entity.transform.setPosition(0, 3, 6);
  camera.entity.transform.lookAt(new Vector3());
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24, samples);
  camera.renderTarget = target;
  const renderer = scene.createRootEntity().addComponent(MeshRenderer);
  const mesh = PrimitiveMesh.createPlane(engine, 30, 30);
  renderer.mesh = mesh;
  const material = new PBRMaterial(engine);
  material.metallic = 0;
  material.roughness = 0.2;
  material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
  renderer.setMaterial(material);
  const pass = (camera as unknown as { _renderPipeline: { _screenSpaceReflectionPass: PassInternals } })._renderPipeline
    ._screenSpaceReflectionPass;
  const mockTrace = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
  let injectedTrace: number[] | null = null;
  let traced = new Float32Array(0);
  let filtered = new Float32Array(0);
  let surfaceFormats: TextureFormat[] = [];
  let geometry = new Uint8Array(SIZE * SIZE * 4);
  let response = new Uint8Array(SIZE * SIZE * 4);
  let correctionResponse = new Uint8Array(SIZE * SIZE * 4);
  const sourceConfidence = new Float32Array(SIZE * SIZE);
  camera.screenSpaceReflection.profiler = {
    beginSample(stage) {
      if (stage === "trace") {
        surfaceFormats = pass._surfaceTarget.colorTextures.map((texture) => texture!.format);
        (pass._surfaceTarget.getColorTexture(0) as Texture2D).getPixelBuffer(0, 0, SIZE, SIZE, 0, geometry);
        const rawResponse = readTraceTarget(pass._surfaceTarget, SIZE, 1);
        for (let i = 0; i < response.length; i += 4) {
          const confidence = rawResponse[i + 3] < 0 ? -rawResponse[i + 3] - 1 : 1;
          sourceConfidence[i / 4] = confidence;
          for (let c = 0; c < 3; c++) {
            response[i + c] = Math.round(rawResponse[i + c] * 255);
            correctionResponse[i + c] = Math.round(response[i + c] * confidence);
          }
          response[i + 3] = rawResponse[i + 3] < 0 ? 255 : Math.round(rawResponse[i + 3] * 255);
        }
      }
      if (stage === "composite" && injectedTrace) {
        mockTrace.setPixelBuffer(new Uint8Array(injectedTrace));
        pass._material.shaderData.setTexture("material_SSRTraceTexture", mockTrace);
      } else if (stage === "composite") {
        traced = readTraceTarget(pass._traceTarget, pass._traceTarget.width);
        if (pass._filteredTraceTarget)
          filtered = readTraceTarget(pass._filteredTraceTarget, pass._filteredTraceTarget.width);
      }
    },
    endSample() {}
  };
  const textures: Texture2D[] = [];
  return {
    scene,
    camera,
    renderer,
    material,
    pass,
    texture(rgba: number[] | Float32Array, width = 1, height = 1) {
      const texture = new Texture2D(
        engine,
        width,
        height,
        rgba instanceof Float32Array ? TextureFormat.R32G32B32A32 : TextureFormat.R8G8B8A8,
        false,
        false
      );
      texture.setPixelBuffer(rgba instanceof Float32Array ? rgba : new Uint8Array(rgba));
      textures.push(texture);
      return texture;
    },
    render(trace: number[] | null = null) {
      injectedTrace = trace;
      surfaceFormats = [];
      geometry.fill(0);
      response.fill(0);
      traced = new Float32Array(0);
      filtered = new Float32Array(0);
      engine.update();
      expect(engine._hardwareRenderer.gl.getError()).toBe(0);
      const point = camera.worldToScreenPoint(new Vector3(), new Vector3());
      const offset = ((SIZE - 1 - Math.floor(point.y)) * SIZE + Math.floor(point.x)) * 4;
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      return {
        surfaceFormats: surfaceFormats.slice(),
        geometry: Array.from(geometry.slice(offset, offset + 4)),
        response: Array.from(response.slice(offset, offset + 4)),
        correctionResponse: Array.from(correctionResponse.slice(offset, offset + 4)),
        color: Array.from(pixels.slice(offset, offset + 4)),
        pixels,
        trace: traced,
        filtered,
        surface: geometry.slice(),
        responses: response.slice(),
        correctionResponses: correctionResponse.slice(),
        sourceConfidence: sourceConfidence.slice()
      };
    },
    destroy() {
      camera.screenSpaceReflection.profiler = null;
      scene.destroy();
      target.destroy();
      output.destroy();
      material.destroy();
      mesh.destroy();
      mockTrace.destroy();
      environment.destroy();
      textures.forEach((texture) => texture.destroy());
    }
  };
}

it("requires a Clear Coat opt-in on custom V3 surfaces while retaining their uncoated capability", () => {
  const shader = Shader.create(`Shader "Test/UnlayeredV3" { SubShader "Default" { Pass "Surface" {
    Tags { pipelineStage = "ScreenSpaceReflectionSurface", screenSpaceReflectionReceiver = "ColorResponseV3" }
    VertexShader = vert; FragmentShader = frag;
    struct Attributes { vec3 POSITION; };
    void vert(Attributes v) { gl_Position = vec4(v.POSITION, 1.0); }
    void frag() { gl_FragColor = vec4(1.0); }
  } } }`)!;
  const material = new Material(engine, shader);
  try {
    expect(SSR.getMaterialReceiverCapability(material).supported).toBe(true);
    material.shaderData.enableMacro("MATERIAL_ENABLE_CLEAR_COAT");
    expect(SSR.getMaterialReceiverCapability(material).supported).toBe(false);
  } finally {
    material.destroy();
    shader.destroy();
  }
});

it.each([0.5, 0.25])("keeps stable Gaussian neighbors continuous across a local layer switch at scale %s", (scale) => {
  const f = fixture();
  const emissive = new PBRMaterial(engine);
  const panelMesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
  try {
    f.scene.screenSpaceReflection.apply({
      resolutionScale: scale,
      upsamplingMode: Upsampling.GaussianBilateral,
      maxRaySteps: 64,
      maxRayDistance: 40,
      thickness: 0.5
    });
    f.camera.entity.transform.setPosition(0, 1.2, 6);
    f.camera.entity.transform.lookAt(new Vector3(0, 0.4, 0));
    f.material.roughness = f.material.clearCoatRoughness = 0.05;
    f.material.clearCoatNormalTexture = f.texture([146, 128, 254, 255]);
    const mask = new Array(512 * 4).fill(0);
    for (let x = 254; x <= 258; x++) mask[x * 4] = 255;
    f.material.clearCoatTexture = f.texture(mask, 512);
    f.material.clearCoatTexture.filterMode = TextureFilterMode.Point;
    const panel = f.scene.createRootEntity().addComponent(MeshRenderer);
    panel.mesh = panelMesh;
    panel.entity.transform.setPosition(0, 1.2, -1);
    panel.entity.transform.setRotation(90, 0, 0);
    emissive.baseColor.set(0, 0, 0, 1);
    emissive.emissiveColor.set(1, 1, 1, 1);
    emissive.emissiveTexture = f.texture([255, 0, 0, 255, 0, 0, 255, 255], 2);
    emissive.emissiveTexture.filterMode = TextureFilterMode.Point;
    emissive.screenSpaceReflection = { mode: "Off", intensity: 0 };
    panel.setMaterial(emissive);
    const base = f.render();
    f.material.clearCoat = 1;
    const coated = f.render();
    const traceSize = SIZE * scale;
    const surfaceIndex = (x: number, y: number) =>
      (Math.floor((y + 0.5) / scale) * SIZE + Math.floor((x + 0.5) / scale)) * 4;
    let sourceOffset = -1;
    for (let y = 3; y < traceSize - 3 && sourceOffset < 0; y++) {
      for (let x = 3; x < traceSize - 3; x++) {
        const offset = surfaceIndex(x, y);
        const traceOffset = (y * traceSize + x) * 4;
        if (
          base.surface[offset] !== coated.surface[offset] &&
          Math.abs(base.trace[traceOffset] - coated.trace[traceOffset]) > 0.1
        ) {
          sourceOffset = offset;
          break;
        }
      }
    }
    expect(sourceOffset).toBeGreaterThanOrEqual(0);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 16; i++) {
      f.material.clearCoat = (lo + hi) / 2;
      const sample = f.render();
      if (sample.surface[sourceOffset] !== base.surface[sourceOffset]) hi = f.material.clearCoat;
      else lo = f.material.clearCoat;
    }
    expect(hi).toBeLessThan(1);
    f.material.clearCoat = lo;
    const before = f.render();
    f.material.clearCoat = hi;
    const after = f.render();
    expect(Math.max(...before.correctionResponses.slice(sourceOffset, sourceOffset + 3))).toBeLessThanOrEqual(1);
    expect(Math.max(...after.correctionResponses.slice(sourceOffset, sourceOffset + 3))).toBeLessThanOrEqual(1);
    f.material.screenSpaceReflection = { mode: "Auto", intensity: 0.5 };
    const halfStrength = f.render();
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const forward = f.render();
    let changedSources = 0;
    let stableNeighbors = 0;
    let maxStableDelta = 0;
    let strengthDelta = 0;
    let strengthSamples = 0;
    let maxPremultExcess = 0;
    let maxLinearColorError = 0;
    for (let y = 3; y < traceSize - 3; y++) {
      for (let x = 3; x < traceSize - 3; x++) {
        const surfaceOffset = surfaceIndex(x, y);
        const offset = (y * traceSize + x) * 4;
        if (before.surface[surfaceOffset + 3] === 0) continue;
        if (before.surface[surfaceOffset] !== after.surface[surfaceOffset]) {
          changedSources++;
          continue;
        }
        if (before.responses[surfaceOffset] < 4 || before.trace[offset + 3] < 0.1) continue;
        stableNeighbors++;
        for (let channel = 0; channel < 3; channel++) {
          maxPremultExcess = Math.max(
            maxPremultExcess,
            before.filtered[offset + channel] - before.filtered[offset + 3],
            after.filtered[offset + channel] - after.filtered[offset + 3]
          );
          maxLinearColorError = Math.max(
            maxLinearColorError,
            Math.abs(
              halfStrength.pixels[surfaceOffset + channel] -
                forward.pixels[surfaceOffset + channel] -
                (after.pixels[surfaceOffset + channel] - forward.pixels[surfaceOffset + channel]) * 0.5
            )
          );
          maxStableDelta = Math.max(
            maxStableDelta,
            Math.abs(before.filtered[offset + channel] - after.filtered[offset + channel])
          );
          if (after.responses[surfaceOffset] >= 16) {
            strengthDelta += Math.abs(after.filtered[offset + channel] - halfStrength.filtered[offset + channel]);
            strengthSamples++;
          }
        }
      }
    }
    const meanStrengthDelta = strengthDelta / strengthSamples;
    console.info(
      JSON.stringify({
        scale,
        lo,
        hi,
        changedSources,
        stableNeighbors,
        maxStableDelta,
        meanStrengthDelta,
        maxPremultExcess,
        maxLinearColorError
      })
    );
    expect(changedSources).toBeGreaterThan(0);
    expect(stableNeighbors).toBeGreaterThan(10);
    expect(maxStableDelta).toBeLessThan(2 / 255);
    // Material strength belongs to the receiver response, never source weighting.
    // Multiplying Trace radiance by receiver strength would halve this signal.
    expect(strengthSamples).toBeGreaterThan(30);
    expect(meanStrengthDelta).toBeLessThan(1 / 255);
    expect(maxPremultExcess).toBeLessThanOrEqual(1 / 1024);
    expect(maxLinearColorError).toBeLessThanOrEqual(2);
  } finally {
    f.destroy();
    emissive.destroy();
    panelMesh.destroy();
  }
});

// A tessellated, coplanar floor with one constant texture coordinate per quad.
// This gives a real local strength map at authoritative pixel centers without
// replacing Surface or Trace. All quad positions come from camera rays at y=0.
function pixelMappedFloor(camera: Camera): ModelMesh {
  const positions: Vector3[] = [];
  const normals: Vector3[] = [];
  const tangents: Vector4[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  const ray = new Ray();
  const ground = (x: number, y: number) => {
    camera.screenPointToRay(new Vector2(x, SIZE - y), ray);
    const t = -ray.origin.y / ray.direction.y;
    return t > 0 ? new Vector3(ray.origin.x + t * ray.direction.x, 0, ray.origin.z + t * ray.direction.z) : null;
  };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const corners = [ground(x, y), ground(x + 1, y), ground(x, y + 1), ground(x + 1, y + 1)];
      if (corners.some((p) => !p || Math.abs(p.x) > 15 || Math.abs(p.z) > 15)) continue;
      const start = positions.length;
      for (const p of corners) {
        positions.push(p!);
        normals.push(new Vector3(0, 1, 0));
        tangents.push(new Vector4(1, 0, 0, -1));
        uvs.push(new Vector2((x + 0.5) / SIZE, 1 - (y + 0.5) / SIZE));
      }
      indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
    }
  }
  const mesh = new ModelMesh(engine);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setTangents(tangents);
  mesh.setUVs(uvs);
  mesh.setIndices(new Uint16Array(indices));
  mesh.addSubMesh(0, indices.length);
  mesh.bounds.min.set(-15, 0, -15);
  mesh.bounds.max.set(15, 0, 15);
  mesh.uploadData(false);
  return mesh;
}

it.each(
  [0.5, 0.25].flatMap((scale) =>
    [Upsampling.Bilinear, Upsampling.Bilateral, Upsampling.GaussianBilateral].flatMap((mode) =>
      (["switch", "one-lsb"] as const).map((transition) => [scale, mode, transition] as const)
    )
  )
)(
  "keeps unsampled receivers continuous for grouped real Trace origins (scale %s, mode %s, %s)",
  (scale, mode, transition) => {
    const f = fixture();
    const emissive = new PBRMaterial(engine);
    const panelMesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
    let floor: ModelMesh | null = null;
    try {
      f.scene.screenSpaceReflection.apply({
        resolutionScale: scale,
        upsamplingMode: mode,
        maxRaySteps: 64,
        maxRayDistance: 40,
        thickness: 0.5
      });
      f.camera.entity.transform.setPosition(0, 1.2, 6);
      f.camera.entity.transform.lookAt(new Vector3(0, 0.4, 0));
      f.render(); // Initialize camera viewport/aspect before constructing the coplanar mesh.
      floor = pixelMappedFloor(f.camera);
      f.renderer.mesh = floor;
      f.material.roughness = f.material.clearCoatRoughness = 0.05;
      f.material.clearCoatNormalTexture = f.texture([146, 128, 254, 255]);
      const panel = f.scene.createRootEntity().addComponent(MeshRenderer);
      panel.mesh = panelMesh;
      panel.entity.transform.setPosition(0, 1.2, -1);
      panel.entity.transform.setRotation(90, 0, 0);
      emissive.baseColor.set(0, 0, 0, 1);
      emissive.emissiveColor.set(1, 1, 1, 1);
      emissive.emissiveTexture = f.texture([255, 0, 0, 255, 0, 0, 255, 255], 2);
      emissive.emissiveTexture.filterMode = TextureFilterMode.Point;
      emissive.screenSpaceReflection = { mode: "Off", intensity: 0 };
      panel.setMaterial(emissive);
      const base = f.render();
      f.material.clearCoat = 1;
      const coat = f.render();
      let baselineRayDifferences = 0;
      let baselineHits = 0;
      for (let i = 0; i < base.trace.length; i += 4) {
        if (Math.abs(base.trace[i] - coat.trace[i]) > 0.1) baselineRayDifferences++;
        if (base.trace[i + 3] > 0.1) baselineHits++;
      }
      expect(baselineRayDifferences).toBeGreaterThan(10);
      expect(baselineHits).toBeGreaterThan(10);
      expect(f.camera.screenSpaceReflection.metrics).toMatchObject({ tracePassCount: 1, compositePassCount: 1 });
      const traceSize = SIZE * scale;
      const sources: { offset: number; lo: number; hi: number }[] = [];
      for (let y = 1; y < traceSize - 1; y++) {
        for (let x = 1; x < traceSize - 1; x++) {
          const offset = (Math.floor((y + 0.5) / scale) * SIZE + Math.floor((x + 0.5) / scale)) * 4;
          if (base.surface[offset + 3] && base.surface[offset] !== coat.surface[offset])
            sources.push({ offset, lo: 0, hi: 1 });
        }
      }
      expect(sources.length).toBeGreaterThan(30);
      const values = new Float32Array(SIZE * SIZE * 4);
      const mask = f.texture(values, SIZE, SIZE);
      mask.filterMode = TextureFilterMode.Point;
      f.material.clearCoatTexture = mask;
      // Independently locate each origin's actual GPU layer switch in parallel.
      for (let i = 0; i < 18; i++) {
        for (const s of sources) values[s.offset] = (s.lo + s.hi) / 2;
        mask.setPixelBuffer(values);
        const sample = f.render();
        for (const s of sources) {
          if (sample.surface[s.offset] === base.surface[s.offset]) s.lo = values[s.offset];
          else s.hi = values[s.offset];
        }
      }
      if (transition === "one-lsb") {
        for (const s of sources) {
          s.hi = s.lo;
          s.lo = 0;
        }
        // Locate the final positive RGBA8 response bin on the SAME base lobe.
        // This reproduces normalization cancelling a whole group fading together.
        for (let i = 0; i < 18; i++) {
          for (const s of sources) values[s.offset] = (s.lo + s.hi) / 2;
          mask.setPixelBuffer(values);
          const sample = f.render();
          for (const s of sources) {
            if (Math.max(...sample.correctionResponses.slice(s.offset, s.offset + 3)) > 0) s.lo = values[s.offset];
            else s.hi = values[s.offset];
          }
        }
      }
      for (const s of sources) values[s.offset] = s.lo;
      mask.setPixelBuffer(values);
      const before = f.render();
      for (const s of sources) values[s.offset] = s.hi;
      mask.setPixelBuffer(values);
      const after = f.render();
      let changedRays = 0;
      let stableReceivers = 0;
      let maxStableColorDelta = 0;
      let maxSourceResponse = 0;
      const sourceOffsets = new Set(sources.map((s) => s.offset));
      for (const s of sources) {
        maxSourceResponse = Math.max(
          maxSourceResponse,
          ...before.correctionResponses.slice(s.offset, s.offset + 3),
          ...after.correctionResponses.slice(s.offset, s.offset + 3)
        );
      }
      for (let i = 0; i < before.trace.length; i += 4)
        if (Math.abs(before.trace[i] - after.trace[i]) > 0.1) changedRays++;
      for (let i = 0; i < base.surface.length; i += 4) {
        if (sourceOffsets.has(i) || base.surface[i + 3] === 0 || base.responses[i] < 4) continue;
        expect(before.surface.slice(i, i + 4)).toEqual(after.surface.slice(i, i + 4));
        expect(before.responses.slice(i, i + 4)).toEqual(after.responses.slice(i, i + 4));
        stableReceivers++;
        for (let c = 0; c < 3; c++)
          maxStableColorDelta = Math.max(maxStableColorDelta, Math.abs(before.pixels[i + c] - after.pixels[i + c]));
      }
      console.info(
        JSON.stringify({
          groupedSwitch: true,
          scale,
          mode,
          transition,
          sources: sources.length,
          changedRays,
          baselineRayDifferences,
          baselineHits,
          maxSourceResponse,
          stableReceivers,
          maxStableColorDelta
        })
      );
      expect(maxSourceResponse).toBeLessThanOrEqual(1);
      if (transition === "switch") {
        for (const s of sources) expect(before.surface[s.offset]).not.toBe(after.surface[s.offset]);
      }
      if (transition === "one-lsb") {
        for (const s of sources) {
          expect(Math.max(...before.correctionResponses.slice(s.offset, s.offset + 3))).toBe(1);
          expect(Math.max(...after.correctionResponses.slice(s.offset, s.offset + 3))).toBe(0);
          expect(before.surface.slice(s.offset, s.offset + 4)).toEqual(after.surface.slice(s.offset, s.offset + 4));
        }
      }
      expect(stableReceivers).toBeGreaterThan(100);
      expect(maxStableColorDelta).toBeLessThanOrEqual(2);
    } finally {
      f.destroy();
      floor?.destroy();
      emissive.destroy();
      panelMesh.destroy();
    }
  }
);

it("applies real source confidence once and keeps material intensity out of Trace", () => {
  const f = fixture();
  const emissive = new PBRMaterial(engine);
  const panelMesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
  try {
    f.scene.screenSpaceReflection.apply({ resolutionScale: 1, maxRaySteps: 64, maxRayDistance: 40, thickness: 0.5 });
    f.camera.entity.transform.setPosition(0, 1.2, 6);
    f.camera.entity.transform.lookAt(new Vector3(0, 0.4, 0));
    f.material.roughness = f.material.clearCoatRoughness = 0.05;
    f.material.clearCoatNormalTexture = f.texture([146, 128, 254, 255]);
    const panel = f.scene.createRootEntity().addComponent(MeshRenderer);
    panel.mesh = panelMesh;
    panel.entity.transform.setPosition(0, 1.2, -1);
    panel.entity.transform.setRotation(90, 0, 0);
    emissive.baseColor.set(0, 0, 0, 1);
    emissive.emissiveColor.set(1, 0, 0, 1);
    emissive.screenSpaceReflection = { mode: "Off", intensity: 0 };
    panel.setMaterial(emissive);
    const base = f.render();
    const baseBytes = f.camera.screenSpaceReflection.metrics.estimatedBytes;
    f.material.clearCoat = 0.6;
    const coated = f.render();
    expect(f.camera.screenSpaceReflection.metrics.estimatedBytes - baseBytes).toBe(4 * SIZE * SIZE);
    f.material.screenSpaceReflection = { mode: "Auto", intensity: 0.5 };
    const halfStrength = f.render();
    expect(halfStrength.trace).toEqual(coated.trace);
    expect(halfStrength.sourceConfidence).toEqual(coated.sourceConfidence);
    f.material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const forward = f.render();
    let samples = 0;
    let maxAlphaError = 0;
    let maxCompositeError = 0;
    for (let i = 0; i < coated.trace.length; i += 4) {
      const c = coated.sourceConfidence[i / 4];
      if (c < 0.15 || c > 0.85 || base.trace[i + 3] < 0.1 || coated.surface[i] !== base.surface[i]) continue;
      samples++;
      maxAlphaError = Math.max(maxAlphaError, Math.abs(coated.trace[i + 3] - base.trace[i + 3] * c));
      for (let channel = 0; channel < 3; channel++) {
        const expected = Math.min(
          255,
          Math.max(
            0,
            forward.pixels[i + channel] +
              (coated.trace[i + channel] - coated.trace[i + 3]) * coated.responses[i + channel]
          )
        );
        maxCompositeError = Math.max(maxCompositeError, Math.abs(coated.pixels[i + channel] - expected));
      }
    }
    console.info(JSON.stringify({ sourceConfidenceOnce: true, samples, maxAlphaError, maxCompositeError }));
    expect(samples).toBeGreaterThan(10);
    expect(maxAlphaError).toBeLessThanOrEqual(1 / 1024);
    expect(maxCompositeError).toBeLessThanOrEqual(2);
  } finally {
    f.destroy();
    emissive.destroy();
    panelMesh.destroy();
  }
});

it("preserves legacy V3 receiver weights when a layered receiver shares the response MRT", () => {
  const f = fixture();
  const source = legacySource
    .replaceAll("LegacyViewNormalV2", "LegacyWeightedV3")
    .replace("ColorResponseV2", "ColorResponseV3")
    .replace(
      "vec3 viewNormal = normalize(mat3(camera_ViewMat) * input.normalWS);",
      "vec3 viewNormal = normalize(input.normalWS);"
    )
    .replace("0.1, 1.0);", "0.1, 0.5);")
    .replace("output.responseColor = vec4(1.0);", "output.responseColor = vec4(0.4, 0.2, 0.1, 0.5);");
  const shader = Shader.create(source)!;
  const layered = new PBRMaterial(engine);
  const mesh = PrimitiveMesh.createCuboid(engine, 0.3, 0.3, 0.3);
  try {
    f.material.shader = shader;
    f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
    const before = f.render([128, 0, 0, 128]);
    expect(before.surfaceFormats[1]).toBe(TextureFormat.R8G8B8A8);
    const other = f.scene.createRootEntity().addComponent(MeshRenderer);
    other.entity.transform.setPosition(-2, 2, -2);
    other.mesh = mesh;
    layered.roughness = 1;
    layered.clearCoat = 1;
    layered.clearCoatRoughness = 0.1;
    layered.screenSpaceReflection = { mode: "On", intensity: 1 };
    other.setMaterial(layered);
    const mixed = f.render([128, 0, 0, 128]);
    expect(mixed.surfaceFormats).toEqual([TextureFormat.R8G8B8A8, TextureFormat.R16G16B16A16]);
    let samples = 0;
    let maxDelta = 0;
    for (let i = 0; i < before.surface.length; i += 4) {
      if (before.surface[i + 3] !== 128 || mixed.surface[i + 3] !== 128) continue;
      // The half-float backing store can round an old custom producer across
      // one RGBA8 boundary; receiver weight semantics must remain unchanged.
      for (let c = 0; c < 4; c++)
        expect(Math.abs(before.responses[i + c] - mixed.responses[i + c])).toBeLessThanOrEqual(1);
      expect(mixed.sourceConfidence[i / 4]).toBe(1);
      for (let c = 0; c < 3; c++) maxDelta = Math.max(maxDelta, Math.abs(before.pixels[i + c] - mixed.pixels[i + c]));
      samples++;
    }
    expect(samples).toBeGreaterThan(100);
    expect(maxDelta).toBeLessThanOrEqual(1);
    layered.clearCoat = 0;
    expect(f.render().surfaceFormats[1]).toBe(TextureFormat.R8G8B8A8);
  } finally {
    f.destroy();
    layered.destroy();
    mesh.destroy();
    shader.destroy();
  }
});

it.each([GLCapabilityType.colorBufferHalfFloat, GLCapabilityType.textureHalfFloat])(
  "keeps Forward IBL and ordinary V3 SSR when signed-response capability %s is absent",
  (missing) => {
    const f = fixture();
    const rhi = engine._hardwareRenderer;
    const canIUse = rhi.canIUse;
    rhi.canIUse = function (capability: GLCapabilityType) {
      return capability === missing ? false : canIUse.call(this, capability);
    };
    try {
      f.material.roughness = 1;
      f.material.clearCoat = 1;
      f.material.clearCoatRoughness = 0.1;
      expect(SSR.getMaterialReceiverCapability(f.material)).toMatchObject({
        supported: false,
        unsupportedReason: "unsupported-screen-space-reflection-source-confidence-format"
      });
      const fallback = f.render();
      expect(f.camera.screenSpaceReflection.metrics.tracePassCount).toBe(0);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      expect(f.render().pixels).toEqual(fallback.pixels);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      f.material.clearCoat = 0;
      f.material.roughness = 0.1;
      expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
      const ordinary = f.render();
      expect(f.camera.screenSpaceReflection.metrics.tracePassCount).toBe(1);
      expect(ordinary.surfaceFormats[1]).toBe(TextureFormat.R8G8B8A8);
    } finally {
      rhi.canIUse = canIUse;
      f.destroy();
    }
  }
);

it("compiles the source Surface contract with Clear Coat maps using mesh tangents and derivative tangents", () => {
  const shader = Shader.create(
    surfaceSource.replace('Shader "Pipeline/ScreenSpaceReflectionSurface"', 'Shader "Test/ClearCoatSurface300"'),
    ShaderLanguage.GLSLES300
  )!;
  try {
    expect(shader.subShaders[0].passes[0].getTagValue(SSR.MATERIAL_CLEAR_COAT_RECEIVER_TAG)).toBe(
      SSR.MATERIAL_CLEAR_COAT_RECEIVER_CONTRACT
    );
    const maps = [
      "MATERIAL_ENABLE_CLEAR_COAT",
      "MATERIAL_HAS_CLEAR_COAT_TEXTURE",
      "MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE",
      "MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE",
      "MATERIAL_HAS_NORMALTEXTURE"
    ];
    for (const geometry of [[], ["RENDERER_HAS_NORMAL"], ["RENDERER_HAS_NORMAL", "RENDERER_HAS_TANGENT"]]) {
      expect(shader.compileVariant(engine, [...maps, ...geometry])).toBe(true);
    }
  } finally {
    shader.destroy();
  }
});

it("uses each layer's texture-resolved roughness and independent normal, including scalar-above-cutoff Auto", () => {
  const f = fixture();
  try {
    f.material.roughness = 1;
    f.material.clearCoat = 1;
    f.material.clearCoatRoughness = 1;
    f.material.clearCoatRoughnessTexture = f.texture([255, 26, 255, 255]);
    f.material.clearCoatNormalTexture = f.texture([200, 128, 230, 255]);
    const coat = f.render();
    expect(coat.geometry[3]).toBe(255);
    expect(coat.geometry[2]).toBeCloseTo(26, -1);
    f.material.clearCoat = 0;
    f.material.roughness = 0.1;
    f.material.normalTexture = f.material.clearCoatNormalTexture;
    const base = f.render();
    expect(coat.geometry.slice(0, 2)).toEqual(base.geometry.slice(0, 2));
    f.material.normalTexture = null;
    const flatBase = f.render();
    expect(coat.geometry.slice(0, 2)).not.toEqual(flatBase.geometry.slice(0, 2));
    f.material.clearCoat = 1;
    f.material.clearCoatRoughnessTexture = null;
    expect(f.render().geometry).toEqual(flatBase.geometry);
    f.material.roughness = 1;
    f.render();
    expect(f.camera.screenSpaceReflection.metrics.surfacePassDrawCount).toBe(0);
  } finally {
    f.destroy();
  }
});

it("preserves uncoated response at texture zero and fades through IBL at a layer switch", () => {
  const f = fixture();
  try {
    const uncoated = f.render([128, 0, 0, 255]);
    f.material.clearCoat = 1;
    f.material.clearCoatRoughness = 0.1;
    f.material.clearCoatTexture = f.texture([0, 255, 255, 255]);
    expect(f.render([128, 0, 0, 255]).pixels).toEqual(uncoated.pixels);
    f.material.clearCoatTexture = null;
    f.material.clearCoatNormalTexture = f.texture([200, 128, 230, 255]);
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      f.material.clearCoat = mid;
      const sample = f.render();
      if (sample.geometry[2] < 40) hi = mid;
      else lo = mid;
    }
    expect(hi).toBeLessThan(1);
    const switchNormals: number[][] = [];
    for (const strength of [lo, hi]) {
      f.material.clearCoat = strength;
      const sample = f.render([128, 0, 0, 255]);
      switchNormals.push(sample.geometry.slice(0, 2));
      expect(Math.max(...sample.correctionResponse.slice(0, 3))).toBeLessThanOrEqual(1);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const forward = f.render();
      expect(Math.max(...sample.color.map((v, i) => Math.abs(v - forward.color[i])))).toBeLessThanOrEqual(1);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    }
    expect(switchNormals[0]).not.toEqual(switchNormals[1]);
    f.material.clearCoat = 0.0001;
    const weak = f.render([128, 0, 0, 255]);
    expect(weak.geometry).toEqual(uncoated.geometry);
    expect(Math.max(...weak.color.map((v, i) => Math.abs(v - uncoated.color[i])))).toBeLessThanOrEqual(1);
  } finally {
    f.destroy();
  }
});

it("updates the Surface cutoff before the first trace without publishing Water inputs", () => {
  const f = fixture();
  try {
    f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
    f.material.roughness = 1;
    f.material.clearCoat = 1;
    f.material.clearCoatRoughness = 0.1;
    const observations: { published: number; surface: number }[] = [];
    f.camera.screenSpaceReflection.profiler = {
      beginSample(stage) {
        if (stage !== "surface") return;
        observations.push({
          published: f.camera.shaderData.getFloat("camera_ScreenSpaceReflectionMaxRoughness"),
          surface: f.camera.shaderData.getFloat("camera_ScreenSpaceReflectionSurfaceMaxRoughness")
        });
      },
      endSample() {}
    };
    for (const maxRoughness of [0.6, 0.05, 0.6]) {
      f.scene.screenSpaceReflection.maxRoughness = maxRoughness;
      f.render();
      expect(f.camera.screenSpaceReflection.metrics.surfacePassDrawCount).toBe(1);
      expect(observations.at(-1)).toEqual({ published: -1, surface: maxRoughness });
    }
  } finally {
    f.destroy();
  }
});

it.each([1, 4])(
  "replaces only the selected IBL lobe and preserves Forward fallback within RGBA8 tolerance (MSAA=%s)",
  (samples) => {
    const f = fixture(samples);
    try {
      f.material.clearCoat = 1;
      f.material.clearCoatRoughness = 0.1;
      f.material.roughness = 1;
      const coat = f.render([255, 0, 0, 128]);
      expect(coat.geometry[3]).toBe(255);
      expect(f.camera.screenSpaceReflection.metrics).toMatchObject({
        surfacePassDrawCount: 1,
        tracePassCount: 1,
        compositePassCount: 1
      });
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const forward = f.render();
      expect(coat.color[0]).toBeGreaterThan(forward.color[0]);
      expect(coat.color[1]).toBeLessThan(forward.color[1]);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      const miss = f.render([0, 0, 0, 0]);
      // Enabling SSR adds an LDR scene copy even on a miss. Its extra
      // quantization is bounded by the existing uncoated pipeline's one-LSB contract.
      expect(maxByteDelta(miss.pixels, forward.pixels)).toBeLessThanOrEqual(1);
      f.material.screenSpaceReflection = { mode: "Auto", intensity: 0 };
      expect(f.render([128, 0, 0, 128]).pixels).toEqual(forward.pixels);
      f.material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
      f.scene.screenSpaceReflection.intensity = 0;
      expect(f.render([128, 0, 0, 128]).pixels).toEqual(forward.pixels);
      f.scene.screenSpaceReflection.intensity = 1;
      f.material.alphaCutoff = 0.5;
      f.material.baseTexture = f.texture([255, 255, 255, 0]);
      expect(f.render().geometry[3]).toBe(0);
      f.material.baseTexture = null;
      expect(f.render().geometry[3]).toBe(255);
    } finally {
      f.destroy();
    }
  }
);

it.each([
  [1, Upsampling.Bilinear],
  [0.5, Upsampling.Bilateral],
  [0.5, Upsampling.GaussianBilateral],
  [0.25, Upsampling.Bilinear]
])("traces and composites a real clear-coated floor at scale %s, reconstruction %s", (scale, upsamplingMode) => {
  const f = fixture();
  const emissive = new PBRMaterial(engine);
  const panelMesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
  try {
    f.scene.ambientLight.specularIntensity = 0.05;
    f.scene.screenSpaceReflection.apply({
      resolutionScale: scale,
      upsamplingMode,
      maxRaySteps: 64,
      maxRayDistance: 40,
      thickness: 0.5
    });
    f.camera.entity.transform.setPosition(0, 1.2, 6);
    f.camera.entity.transform.lookAt(new Vector3(0, 0.4, 0));
    f.material.roughness = 1;
    f.material.clearCoat = 1;
    f.material.clearCoatRoughness = 0.05;
    const panel = f.scene.createRootEntity().addComponent(MeshRenderer);
    panel.mesh = panelMesh;
    panel.entity.transform.setPosition(0, 1.2, -1);
    panel.entity.transform.setRotation(90, 0, 0);
    emissive.baseColor.set(0, 0, 0, 1);
    emissive.emissiveColor.set(1, 0, 0, 1);
    emissive.screenSpaceReflection = { mode: "Off", intensity: 0 };
    panel.setMaterial(emissive);
    const on = f.render();
    const trace = on.trace;
    let hits = 0;
    for (let i = 3; i < trace.length; i += 4) if (trace[i] > 0.01) hits++;
    expect(hits).toBeGreaterThan(10);
    expect(f.camera.screenSpaceReflection.metrics).toMatchObject({
      surfacePassDrawCount: 1,
      tracePassCount: 1,
      compositePassCount: 1
    });
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const off = f.render();
    let reflected = 0;
    for (let i = 0; i < on.pixels.length; i += 4) if (on.pixels[i] - off.pixels[i] > 2) reflected++;
    expect(reflected).toBeGreaterThan(20);
    console.info(JSON.stringify({ scale, upsamplingMode, hits, reflected }));
  } finally {
    f.destroy();
    emissive.destroy();
    panelMesh.destroy();
  }
});
afterAll(() => engine.destroy());

it("matches Forward base attenuation and coat strength, applies AO/fog only to the correction", () => {
  const f = fixture();
  try {
    f.material.metallic = 1;
    f.material.baseColor.set(0.2, 0.3, 0.4, 1);
    const base = f.render();
    f.material.clearCoat = 0.25;
    f.material.clearCoatRoughness = 0.1;
    const attenuated = f.render();
    expect(attenuated.geometry).toEqual(base.geometry);
    const dotNV = 3 / Math.hypot(3, 6);
    const attenuation = 1 - 0.25 * (0.04 + 0.96 * (1 - dotNV) ** 5);
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(attenuated.response[channel] - base.response[channel] * attenuation)).toBeLessThanOrEqual(1);
    }
    f.material.roughness = 1;
    f.material.clearCoat = 0.5;
    const halfCoat = f.render();
    f.material.clearCoat = 1;
    const fullCoat = f.render([255, 0, 0, 255]);
    expect(Math.abs(fullCoat.response[0] - halfCoat.response[0] * 2)).toBeLessThanOrEqual(1);
    f.material.occlusionTexture = f.texture([0, 0, 0, 255]);
    const occluded = f.render();
    expect(occluded.response[0]).toBeLessThan(fullCoat.response[0]);
    f.material.occlusionTexture = null;
    f.scene.fogMode = FogMode.Exponential;
    f.scene.fogDensity = 0.2;
    const fogged = f.render([255, 0, 0, 255]);
    expect(fogged.response[0]).toBeLessThan(fullCoat.response[0]);
    const miss = f.render([0, 0, 0, 0]);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    expect(maxByteDelta(miss.pixels, f.render().pixels)).toBeLessThanOrEqual(1);
  } finally {
    f.destroy();
  }
});

it("accepts Clear Coat PBR for opaque and Alpha Test Auto, retaining all four unsupported lobe exclusions", () => {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.screenSpaceReflection.apply({ activationMode: Activation.ForceOn, receiverPolicy: Policy.StandardPbrAuto });
  const camera = scene.createRootEntity().addComponent(Camera);
  const material = new PBRMaterial(engine);
  material.roughness = 1;
  material.clearCoat = 1;
  material.clearCoatRoughness = 0.1;
  camera.screenSpaceReflection._prepareSettings();
  expect(SSR.getMaterialReceiverCapability(material).supported).toBe(true);
  expect(camera.screenSpaceReflection._isMaterialReceiver(material, RenderQueueType.Opaque)).toBe(true);
  expect(camera.screenSpaceReflection._isMaterialReceiver(material, RenderQueueType.AlphaTest)).toBe(true);
  expect(camera.screenSpaceReflection._isMaterialReceiver(material, RenderQueueType.Transparent)).toBe(false);
  for (const macro of ["ANISOTROPY", "IRIDESCENCE", "SHEEN", "TRANSMISSION"]) {
    material.shaderData.enableMacro(`MATERIAL_ENABLE_${macro}`);
    expect(SSR.getMaterialReceiverCapability(material).supported).toBe(false);
    material.shaderData.disableMacro(`MATERIAL_ENABLE_${macro}`);
  }
  material.destroy();
  scene.destroy();
});
