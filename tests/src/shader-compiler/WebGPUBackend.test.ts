import { beforeAll, describe, expect, it, vi } from "vitest";
import { compileWebGPUShaderPass, createWebGPUShaderCompiler } from "@galacean/engine-shader-compiler/webgpu";
import * as assets from "@galacean/engine-shader/webgpu";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  type IPrecompiledShader,
  type IWebGPUShaderCompiler,
  type IWebGPUShaderProgram
} from "@galacean/engine-design";
import {
  AssetType,
  Camera,
  DirectLight,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderLanguage,
  ShadowType,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  Vector4,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";

const vs = "void vert() { gl_Position = vec4(0.0); }";
let compiler: IWebGPUShaderCompiler;
let shaderCompiler: ShaderCompiler;
beforeAll(async () => {
  compiler = await createWebGPUShaderCompiler();
  shaderCompiler = new ShaderCompiler(compiler);
});

function compileShaderLabWGSL(source: string, options?: Parameters<IWebGPUShaderCompiler["compileWebGPUVariant"]>[2]) {
  const pass = shaderCompiler._parseShaderPass(source, "vert", "frag", ShaderLanguage.WGSL);
  expect(pass?.wgslVertexInstructions?.length).toBeGreaterThan(0);
  return options ? compileWebGPUShaderPass(compiler, pass!, new Map(), options) : pass!.wgsl!;
}

it("bakes both native stages and reflection in every built-in render pass", () => {
  const shaders = Object.entries(assets).filter(([key]) => key.endsWith("Source"));
  expect(shaders).toHaveLength(37);
  let passes = 0;
  for (const [, asset] of shaders) {
    const shader = asset as IPrecompiledShader;
    expect(shader.platformTarget).toBe(1);
    for (const group of shader.subShaders)
      for (const pass of group.passes) {
        if (pass.isUsePass) continue;
        expect(pass.wgsl?.vertex).toContain("@vertex");
        expect(pass.wgsl?.fragment).toContain("@fragment");
        expect(pass.wgslVertexInstructions?.length).toBeGreaterThan(0);
        passes++;
      }
  }
  expect(passes).toBe(55);
});

it("retains explicit WGSL pass compilation and its backend requirement", () => {
  const source = "void vert() { gl_Position = vec4(0.0); } void frag() { gl_FragColor = vec4(1.0); }";
  const pass = new ShaderCompiler(compiler)._parseShaderPass(source, "vert", "frag", ShaderLanguage.WGSL);
  expect(pass?.vertex).toContain("@vertex");
  expect(pass?.fragment).toContain("@fragment");
  expect(pass?.wgsl?.vertex).toBe(pass?.vertex);
  expect(() => new ShaderCompiler()._parseShaderPass(source, "vert", "frag", ShaderLanguage.WGSL))
    .toThrow(/requires a backend/);
});

it("elides samplers for a texture fetched through two helper functions", () => {
  const { reflection, fragment: code } = compileShaderLabWGSL(
    `${vs}
    sampler2D pixels;
    vec4 load(sampler2D t) { return texelFetch(t, ivec2(0), 0); }
    vec4 loadIndirect(sampler2D t) { return load(t); }
    void frag() { gl_FragColor = loadIndirect(pixels); }`,
    { maxSamplersPerStage: 0 }
  );
  expect(reflection.textures).toHaveLength(1);
  expect(reflection.textures[0]).toMatchObject({ name: "pixels", sampleType: "unfilterable-float" });
  expect(reflection.textures[0].samplerBinding).toBeUndefined();
  expect(code).toContain("textureLoad");
  expect(code).not.toMatch(/:\s*sampler\b/);
});

it("preserves each binding in sampler arrays and uniform declarations", () => {
  const { reflection } = compileShaderLabWGSL(
    `${vs}
    sampler2D material_a;
    sampler2D material_images[2];
    vec4 leftTint;
    vec4 rightTint;
    void frag() { gl_FragColor = texture(material_a, vec2(0.0)) * leftTint + texture(material_images[1], vec2(0.0)) * rightTint; }`
  );
  expect(reflection.textures.map((t) => [t.name, t.arrayIndex])).toEqual([
    ["material_a", undefined],
    ["material_images", 1]
  ]);
  expect(reflection.uniformBlocks.flatMap((b) => b.members).map((m) => m.name)).toEqual(["leftTint", "rightTint"]);
});

it("specializes integer vertex formats and float/depth sampling independently", () => {
  const src = `
    struct Attributes { vec4 JOINTS_0; };
    sampler2D colors;
    sampler2DShadow shadow;
    void vert(Attributes a) { gl_Position = a.JOINTS_0; }
    void frag() { gl_FragColor = texture(colors, vec2(0.5)) * texture(shadow, vec3(0.5)); }`;
  const { vertex: code, reflection } = compileShaderLabWGSL(src, {
    vertexInputTypes: { JOINTS_0: "uint" },
    unfilterableTextures: new Set(["colors"])
  });
  expect(reflection.vertexInputs[0]).toMatchObject({ name: "JOINTS_0", type: "uint", components: 4 });
  expect(code).toContain("vec4<u32>");
  expect(reflection.textures.map((t) => [t.sampleType, t.samplerType])).toEqual([
    ["unfilterable-float", "non-filtering"],
    ["depth", "comparison"]
  ]);
  expect(() => compileShaderLabWGSL(src, { maxSamplersPerStage: 1 })).toThrow(/sampler limit/);
});

it("preserves public leaf and array names when separating opaque struct resources", () => {
  const program = compileShaderLabWGSL(
    `${vs}
    struct Layer { sampler2D images[2]; vec4 tint; };
    Layer material_layer;
    const int INDEX = 1;
    void frag() { gl_FragColor = texture(material_layer.images[INDEX], vec2(0.5)) * material_layer.tint; }`
  );
  const reflected = program.reflection;
  expect(reflected.textures.map((t) => [t.name, t.arrayIndex, t.group])).toEqual([["material_layer.images", 1, 2]]);
  expect(reflected.uniformBlocks.flatMap((b) => b.members).map((m) => m.name)).toEqual(["material_layer.tint"]);
});

describe.skipIf(!navigator.gpu)("Native WGSL compatibility", () => {
  it("loads raw ShaderLab whose vertex input requires a renderer-selected macro", async () => {
    const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
    try {
      const shader = Shader.create(`Shader "RendererSelectedInput" { SubShader "s" { Pass "p" {
        struct Attributes {
          vec3 POSITION;
          #ifdef USE_CORNER
          vec4 corner;
          #endif
        };
        void vert(Attributes attr) { gl_Position = vec4(attr.POSITION, 1.0) + attr.corner; }
        void frag() { gl_FragColor = vec4(1.0); }
        VertexShader = vert; FragmentShader = frag;
      } } }`, engine);
      expect(shader.compileVariant(engine, ["USE_CORNER"])).toBe(true);
      expect(() => shader.compileVariant(engine, [])).toThrow(/corner/);
    } finally {
      engine.destroy();
    }
  });

  it("writes back named and indexed vector output arguments at the call site", async () => {
    const program = compileShaderLabWGSL(`
      void vert() {
        int i = gl_VertexID;
        gl_Position = vec4(vec2((i << 1) & 2, i & 2) * 2.0 - 1.0, 0.0, 1.0);
      }
      float adjust(inout float x, out float y) { x += 0.25; y = 0.75; return x; }
      void swapPair(inout vec2 p) { p = p.yx; }
      void nested(inout vec4 value, int i) {
        if (i == 0) { value.w = adjust(value.x, value.y); }
        else { value.w = adjust(value[2 * i], value.y); }
        swapPair(value.zw);
      }
      void frag() {
        int index = int(gl_FragCoord.x);
        vec4 values[2];
        values[index] = vec4(0.25, 0.0, 0.0, 1.0);
        nested(values[index], index);
        gl_FragColor = values[index];
      }`);
    const device = await (await navigator.gpu.requestAdapter())!.requestDevice();
    try {
      const pipeline = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module: device.createShaderModule({ code: program.vertex }) },
        fragment: { module: device.createShaderModule({ code: program.fragment }), targets: [{ format: "rgba8unorm" }] }
      });
      const target = device.createTexture({
        size: [2, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });
      const read = device.createBuffer({ size: 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const encoder = device.createCommandEncoder();
      const draw = encoder.beginRenderPass({
        colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }]
      });
      draw.setPipeline(pipeline);
      draw.draw(3);
      draw.end();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: read }, [2, 1]);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      expect(Array.from(new Uint8Array(read.getMappedRange()))).toEqual([128, 191, 128, 0, 64, 191, 64, 64]);
    } finally {
      device.destroy();
    }
  });

  it("reads indexed and whole std140 arrays with their original byte strides", async () => {
    const device = await (await navigator.gpu.requestAdapter())!.requestDevice();
    try {
      for (const whole of [false, true]) {
        const shader = compileShaderLabWGSL(`
          float weights[2];
          vec2 pairs[2];
          int indices[2];
          void vert() {
            int i = gl_VertexID;
            gl_Position = vec4(vec2((i << 1) & 2, i & 2) * 2.0 - 1.0, 0.0, 1.0);
          }
          float readWeight(float values[2], int index) { return values[index]; }
          void frag() {
            gl_FragColor = vec4(${whole ? "readWeight(weights, indices[0])" : "weights[indices[0]]"},
              pairs[indices[0]].y, weights[0], 1.0);
          }`);
        const [block] = shader.reflection.uniformBlocks;
        expect(block.members.map((field) => field.arrayStride)).toEqual([16, 16, 16]);
        const bytes = new ArrayBuffer(block.byteLength);
        for (const field of block.members) {
          const index = field.offset / 4;
          if (field.name === "indices") new Int32Array(bytes)[index] = 1;
          if (field.name === "pairs") new Float32Array(bytes)[index + 5] = 0.5;
          if (field.name === "weights") {
            new Float32Array(bytes)[index] = 0.25;
            new Float32Array(bytes)[index + 4] = 1;
          }
        }
        const uniform = device.createBuffer({
          size: bytes.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(uniform, 0, bytes);
        const pipeline = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: device.createShaderModule({ code: shader.vertex }) },
          fragment: {
            module: device.createShaderModule({ code: shader.fragment }),
            targets: [{ format: "rgba8unorm" }]
          }
        });
        const target = device.createTexture({
          size: [1, 1],
          format: "rgba8unorm",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        });
        const read = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const commands = device.createCommandEncoder();
        const pass = commands.beginRenderPass({
          colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }]
        });
        pass.setPipeline(pipeline);
        pass.setBindGroup(
          block.group,
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(block.group),
            entries: [{ binding: block.binding, resource: { buffer: uniform } }]
          })
        );
        pass.draw(3);
        pass.end();
        commands.copyTextureToBuffer({ texture: target }, { buffer: read }, [1, 1]);
        device.queue.submit([commands.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        expect(Array.from(new Uint8Array(read.getMappedRange()))).toEqual([255, 128, 64, 255]);
        read.destroy();
        target.destroy();
        uniform.destroy();
      }
    } finally {
      device.destroy();
    }
  });

  it("draws 21 PBR properties with 17 independent material textures on a 16-view device", async () => {
    const engine = await WebGPUEngine.create({
      canvas: document.createElement("canvas"),
      graphicDeviceOptions: { requiredLimits: { maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16 } }
    });
    engine.canvas.setResolution(32, 32);
    const hardware = engine._hardwareRenderer as WebGPUGraphicDevice;
    const draws = vi.spyOn(hardware, "drawPrimitive");
    try {
      const scene = engine.sceneManager.activeScene;
      scene.background.solidColor.set(0, 0.5, 0.5, 1);
      const camera = scene.createRootEntity().addComponent(Camera);
      camera.entity.transform.setPosition(0, 0, 3);
      camera.opaqueTextureEnabled = true;
      const target = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
      camera.renderTarget = new RenderTarget(engine, 32, 32, target, TextureFormat.Depth24Stencil8);
      const sunlight = scene.createRootEntity().addComponent(DirectLight);
      sunlight.shadowType = ShadowType.SoftLow;
      sunlight.intensity = 0.00001;
      scene.ambientLight.diffuseIntensity = 0;
      scene.ambientLight.specularTexture = engine._basicResources.whiteTextureCube;
      scene.ambientLight.specularIntensity = 0;
      const renderer = scene.createRootEntity().addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      const material = new PBRMaterial(engine);
      renderer.setMaterial(material);
      material.clearCoat = 0.1;
      material.anisotropy = 0.1;
      material.iridescence = 0.1;
      material.transmission = 0.01;
      material.thickness = 0.1;
      material.sheenColor.set(0.1, 0.1, 0.1, 1);
      material.emissiveColor.set(1, 1, 1, 1);
      material.baseColor.set(0, 0, 0, 1);
      material.specularIntensity = 0;
      sunlight.color.set(0, 0, 0, 1);
      const properties = [
        "specularIntensityTexture",
        "specularColorTexture",
        "clearCoatTexture",
        "clearCoatRoughnessTexture",
        "clearCoatNormalTexture",
        "anisotropyTexture",
        "iridescenceThicknessTexture",
        "iridescenceTexture",
        "sheenColorTexture",
        "sheenRoughnessTexture",
        "transmissionTexture",
        "thicknessTexture",
        "baseTexture",
        "normalTexture",
        "emissiveTexture",
        "roughnessMetallicTexture",
        "occlusionTexture"
      ] as const;
      function fill(texture: Texture2D, r: number, g: number, b: number): void {
        const bytes = new Uint8Array(texture.width * texture.height * 4);
        for (let n = 0; n < bytes.length; n += 4) bytes.set([r, g, b, 255], n);
        texture.setPixelBuffer(bytes);
      }
      for (const [i, name] of properties.entries()) {
        const width = 4 << i % 3;
        const texture = new Texture2D(engine, width, width, TextureFormat.R8G8B8A8_UNorm, false, false);
        fill(texture, i + 8, 128, 255);
        material[name] = texture;
      }
      const emissive = material.emissiveTexture;
      emissive.filterMode = TextureFilterMode.Point;
      const pixels = new Uint8Array(4);
      for (const [red, green, blue] of [
        [255, 0, 0],
        [0, 255, 0]
      ]) {
        fill(emissive, red, green, blue);
        hardware.device.pushErrorScope("validation");
        engine.update();
        await target.getPixelBufferAsync(16, 16, 1, 1, pixels);
        expect((await hardware.device.popErrorScope())?.message).toBeUndefined();
        expect(Array.from(pixels).map((n) => (n > 200 ? 255 : n < 12 ? 0 : n))).toEqual([red, green, blue, 255]);
      }
      const replacement = material.baseTexture;
      fill(replacement, 0, 0, 255);
      material.emissiveTexture = replacement;
      engine.update();
      await target.getPixelBufferAsync(16, 16, 1, 1, pixels);
      expect(Array.from(pixels).map((n) => (n > 200 ? 255 : n < 12 ? 0 : n))).toEqual([0, 0, 255, 255]);
      const selected = draws.mock.calls
        .map(([, , program]) => (program as { reflection: IWebGPUShaderProgram["reflection"] }).reflection)
        .filter((r) => r.textures.length === 21);
      expect(selected).toHaveLength(3);
      const materialViews = selected[0].textures.filter((t) => t.arrayLayer !== undefined);
      expect(new Set(materialViews.map((t) => t.arrayLayer)).size).toBe(17);
      expect(new Set(materialViews.map((t) => t.textureBinding)).size).toBe(1);
      expect(new Set(materialViews.map((t) => t.arrayMipOffset ?? 0))).toEqual(new Set([0, 1, 2]));
      expect(new Set(materialViews.map((t) => t.samplerBinding)).size).toBe(4);
      expect(selected[2].textures.find((t) => t.name === "material_EmissiveTexture")!.arrayLayer).toBe(
        selected[2].textures.find((t) => t.name === "material_BaseTexture")!.arrayLayer
      );
    } finally {
      draws.mockRestore();
      engine.destroy();
    }
  });
  it("links physical skin index formats and preserves clip depth and screen derivative orientation", async () => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    try {
      const skinSrc = `
        struct Attributes { vec4 JOINTS_0; };
        void vert(Attributes a) { gl_Position = vec4(a.JOINTS_0.xyz, 1.0); }
        void frag() { gl_FragColor = vec4(1.0); }`;
      for (const format of ["uint8x4", "uint16x4", "float32x4"] as const) {
        const p = compileShaderLabWGSL(skinSrc, {
          vertexInputTypes: { JOINTS_0: format === "float32x4" ? "float" : "uint" }
        });
        await validatePipeline(device, p, format, format);
      }
      const p = compileShaderLabWGSL(`
        struct Varyings { float height; };
        Varyings vert() {
          Varyings o;
          int i = gl_VertexID;
          vec2 pos = vec2((i << 1) & 2, i & 2) * 2.0 - 1.0;
          o.height = pos.y;
          gl_Position = vec4(pos, -0.5, 1.0);
          return o;
        }
        void frag(Varyings i) {
          gl_FragColor = vec4(dFdy(i.height) > 0.0 ? 1.0 : 0.0, gl_FragCoord.z, 1.0, 1.0);
        }`);
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: device.createShaderModule({ code: p.vertex }) },
        fragment: { module: device.createShaderModule({ code: p.fragment }), targets: [{ format: "rgba8unorm" }] }
      });
      const target = device.createTexture({
        size: [4, 4],
        format: "rgba8unorm",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
      });
      const read = device.createBuffer({ size: 1024, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }]
      });
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.end();
      encoder.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow: 256 }, [4, 4]);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      expect(Array.from(new Uint8Array(read.getMappedRange(), 256 + 4, 4))).toEqual([255, 64, 255, 255]);
      read.unmap();
      read.destroy();
      target.destroy();
    } finally {
      device.destroy();
    }
  });
  it("honors separate sampler and sampled-texture limits for extended PBR", async () => {
    const pass = assets.PBRSource.subShaders[0].passes.find((p) => !p.isUsePass)!;
    const flags = new Map<string, string>();
    for (const extension of ["CLEAR_COAT", "ANISOTROPY", "IRIDESCENCE", "SHEEN", "TRANSMISSION"])
      flags.set("MATERIAL_ENABLE_" + extension, "");
    for (const texture of [
      "SPECULAR_TEXTURE",
      "SPECULAR_COLOR_TEXTURE",
      "CLEAR_COAT_TEXTURE",
      "CLEAR_COAT_ROUGHNESS_TEXTURE",
      "CLEAR_COAT_NORMAL_TEXTURE",
      "ANISOTROPY_TEXTURE",
      "IRIDESCENCE_THICKNESS_TEXTURE",
      "IRIDESCENCE_TEXTURE",
      "SHEEN_TEXTURE",
      "SHEEN_ROUGHNESS_TEXTURE",
      "TRANSMISSION_TEXTURE",
      "THICKNESS",
      "THICKNESS_TEXTURE",
      "BASETEXTURE",
      "NORMALTEXTURE",
      "EMISSIVETEXTURE",
      "ROUGHNESS_METALLIC_TEXTURE",
      "OCCLUSION_TEXTURE"
    ])
      flags.set("MATERIAL_HAS_" + texture, "");
    for (const name of [
      "RENDERER_HAS_UV",
      "RENDERER_HAS_NORMAL",
      "RENDERER_HAS_TANGENT",
      "SCENE_USE_SH",
      "SCENE_USE_SPECULAR_ENV",
      "RENDERER_IS_RECEIVE_SHADOWS",
      "MATERIAL_NEED_WORLD_POS"
    ])
      flags.set(name, "");
    flags.set("SCENE_DIRECT_LIGHT_COUNT", "2");
    flags.set("SCENE_POINT_LIGHT_COUNT", "2");
    flags.set("SCENE_SPOT_LIGHT_COUNT", "1");
    flags.set("SCENE_SHADOW_CASCADED_COUNT", "4");
    flags.set("SCENE_SHADOW_TYPE", "2");
    const p = compileWebGPUShaderPass(compiler, pass, flags);
    expect(p.reflection.textures.filter((t) => t.visibility & 2)).toHaveLength(21);
    expect(p.reflection.requiresSamplerKeys).toBe(true);
    const samplerKeys = Object.fromEntries(p.reflection.textures.map((t) => [t.name, t.name]));
    const textureKeys = { ...samplerKeys };
    expect(() =>
      compileWebGPUShaderPass(compiler, pass, flags, { maxTexturesPerStage: 16, textureKeys, textureArrayKeys: {} })
    ).toThrow(/21 sampled textures/);
    expect(() => compileWebGPUShaderPass(compiler, pass, flags, { samplerKeys })).toThrow(/sampler limit of 16/);
    samplerKeys.material_ClearCoatTexture = "nearest";
    for (const t of p.reflection.textures) if (t.name !== "material_ClearCoatTexture") samplerKeys[t.name] = "bilinear";
    const textureArrayKeys = Object.fromEntries(Object.keys(textureKeys).map((name) => [name, "rgba8unorm/32x32/6"]));
    const pooled = compileWebGPUShaderPass(compiler, pass, flags, {
      samplerKeys,
      textureKeys,
      textureArrayKeys,
      maxTexturesPerStage: 16
    });
    expect(pooled.reflection.textures.filter((t) => t.arrayLayer !== undefined)).toHaveLength(17);
    expect(new Set(pooled.reflection.textures.map((t) => t.group + ":" + t.textureBinding)).size).toBe(5);
    for (const name of [
      "SPECULAR_TEXTURE",
      "CLEAR_COAT_TEXTURE",
      "ANISOTROPY_TEXTURE",
      "IRIDESCENCE_THICKNESS_TEXTURE",
      "SHEEN_ROUGHNESS_TEXTURE"
    ])
      flags.delete("MATERIAL_HAS_" + name);
    const baseline = compileWebGPUShaderPass(compiler, pass, flags, { maxTexturesPerStage: 16 });
    expect(baseline.reflection.textures.filter((t) => t.visibility & 2)).toHaveLength(16);
    const defaultDevice = await (await navigator.gpu.requestAdapter())!.requestDevice();
    try {
      await validatePipeline(defaultDevice, pooled, "21 physical PBR textures in five independent shader views");
      await validatePipeline(defaultDevice, baseline, "16 PBR texture views on guaranteed limits");
    } finally {
      defaultDevice.destroy();
    }
  });
  it("links every built-in pass with its default, lighting, joint texture, and instancing interfaces", async () => {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    const features: Record<string, string>[] = [
      {},
      {
        MATERIAL_HAS_BASETEXTURE: "",
        MATERIAL_HAS_NORMALTEXTURE: "",
        MATERIAL_HAS_EMISSIVETEXTURE: "",
        MATERIAL_HAS_OCCLUSION_TEXTURE: "",
        MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE: "",
        RENDERER_HAS_UV: "",
        RENDERER_HAS_NORMAL: "",
        RENDERER_HAS_TANGENT: "",
        RENDERER_HAS_VERTEXCOLOR: "",
        SCENE_FOG_MODE: "1",
        SCENE_DIRECT_LIGHT_COUNT: "2",
        SCENE_POINT_LIGHT_COUNT: "2",
        SCENE_SPOT_LIGHT_COUNT: "1",
        SCENE_USE_SH: "",
        SCENE_USE_SPECULAR_ENV: "",
        RENDERER_IS_RECEIVE_SHADOWS: "",
        SCENE_SHADOW_CASCADED_COUNT: "4",
        SCENE_SHADOW_TYPE: "2",
        MATERIAL_NEED_WORLD_POS: ""
      },
      {
        RENDERER_HAS_SKIN: "",
        RENDERER_USE_JOINT_TEXTURE: "",
        RENDERER_JOINTS_NUM: "4",
        RENDERER_HAS_UV: "",
        RENDERER_HAS_NORMAL: "",
        MATERIAL_HAS_BASETEXTURE: ""
      },
      { RENDERER_GPU_INSTANCE: "", RENDERER_HAS_UV: "", MATERIAL_HAS_BASETEXTURE: "" }
    ];
    try {
      for (const [key, asset] of Object.entries(assets)) {
        if (!key.endsWith("Source")) continue;
        for (const group of (asset as IPrecompiledShader).subShaders)
          for (const pass of group.passes) {
            if (pass.isUsePass) continue;
            for (const [index, set] of features.entries()) {
              const p = index ? compileWebGPUShaderPass(compiler, pass, new Map(Object.entries(set))) : pass.wgsl!;
              await validatePipeline(device, p, key + "." + pass.name + "." + index);
            }
          }
      }
    } finally {
      device.destroy();
    }
  }, 30000);
});

async function validatePipeline(
  device: GPUDevice,
  p: IWebGPUShaderProgram,
  label: string,
  format?: GPUVertexFormat
): Promise<void> {
  const { reflection: r } = p;
  const groups: GPUBindGroupLayoutEntry[][] = [[], [], [], []];
  for (const b of r.uniformBlocks)
    groups[b.group].push({
      binding: b.binding,
      visibility: b.visibility,
      buffer: { type: "uniform", minBindingSize: b.byteLength }
    });
  for (const t of r.textures) {
    const previous = groups[t.group].find((entry) => entry.binding === t.textureBinding);
    if (previous) previous.visibility |= t.visibility;
    else
      groups[t.group].push({
        binding: t.textureBinding,
        visibility: t.visibility,
        texture: { sampleType: t.sampleType, viewDimension: t.viewDimension }
      });
    if (t.samplerBinding !== undefined) {
      const existing = groups[t.group].find((entry) => entry.binding === t.samplerBinding);
      if (existing) existing.visibility |= t.samplerVisibility ?? t.visibility;
      else
        groups[t.group].push({
          binding: t.samplerBinding,
          visibility: t.samplerVisibility ?? t.visibility,
          sampler: { type: t.samplerType }
        });
    }
  }
  device.pushErrorScope("validation");
  const layout = device.createPipelineLayout({
    bindGroupLayouts: groups.map((entries) => device.createBindGroupLayout({ entries }))
  });
  const inputs = r.vertexInputs.map((a) => ({
    shaderLocation: a.location,
    offset: a.location * 16,
    format:
      format ??
      (((a.type === "float" ? "float32" : a.type === "sint" ? "sint32" : "uint32") +
        (a.components === 1 ? "" : "x" + a.components)) as GPUVertexFormat)
  }));
  const vertex = device.createShaderModule({ code: p.vertex, label });
  const fragment = device.createShaderModule({ code: p.fragment, label });
  device.createRenderPipeline({
    label,
    layout,
    vertex: {
      module: vertex,
      entryPoint: p.vertexEntryPoint,
      buffers: inputs.length
        ? [{ arrayStride: (Math.max(...inputs.map((a) => a.shaderLocation)) + 1) * 16, attributes: inputs }]
        : []
    },
    fragment: {
      module: fragment,
      entryPoint: p.fragmentEntryPoint,
      targets: Array.from({ length: Math.max(-1, ...r.fragmentOutputs) + 1 }, (_, i) =>
        r.fragmentOutputs.includes(i) ? { format: "rgba8unorm" } : null
      )
    },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" }
  });
  expect((await device.popErrorScope())?.message, label).toBeUndefined();
}
