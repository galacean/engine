import {
  AssetType,
  Camera,
  Color,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderFactory,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  WebGPUEngine,
  WebGPUGraphicDevice
} from "@galacean/engine-webgpu";
import { expect, it, vi } from "vitest";

it.skipIf(!navigator.gpu)("draws an older shaderc with a runtime macro on its first frame", async () => {
  const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
  const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
  const asset = {
    name: "Tests/Legacy",
    platformTarget: 0,
    subShaders: [
      {
        name: "Default",
        passes: [
          {
            name: "Forward",
            isUsePass: false,
            renderStates: { constantMap: {}, variableMap: {} },
            vertexShaderInstructions: [[0, "in vec3 POSITION; void main(){gl_Position=vec4(POSITION.xy,0.,1.);}"]],
            fragmentShaderInstructions: [
              [0, "uniform float oldTint; out vec4 c; void main(){float r=oldTint*USER_STRENGTH;c=vec4(r,1.-r,0.,1.);}"]
            ]
          }
        ]
      }
    ]
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(asset)]));
  device.pushErrorScope("validation");
  try {
    const shader = await engine.resourceManager.load<Shader>({ url, type: AssetType.Shader });
    const root = engine.sceneManager.activeScene.createRootEntity();
    const camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    const texture = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, 16, 16, texture, TextureFormat.Depth24Stencil8);
    const renderer = root.createChild().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new Material(engine, shader);
    renderer.setMaterial(material);
    material.shaderData.setFloat("oldTint", 0.5);
    const bytes = new Uint8Array(4);
    for (const strength of ["2.0", "0.0", "2.0"]) {
      material.shaderData.enableMacro("USER_STRENGTH", strength);
      camera.render();
      await texture.getPixelBufferAsync(8, 8, 1, 1, bytes);
      expect([...bytes]).toEqual(strength === "2.0" ? [255, 0, 0, 255] : [0, 255, 0, 255]);
    }
    expect(await device.popErrorScope()).toBeNull();
  } finally {
    URL.revokeObjectURL(url);
    engine.destroy();
  }
});

it.skipIf(!navigator.gpu)(
  "instances historical raw GLSL with late renderer colors and independent transforms",
  async () => {
    const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
    const rhi = engine._hardwareRenderer as WebGPUGraphicDevice;
    const asset = {
      name: "Tests/LegacyInstancing",
      platformTarget: 0,
      subShaders: [
        {
          name: "Default",
          passes: [
            {
              name: "Forward",
              isUsePass: false,
              renderStates: { constantMap: {}, variableMap: {} },
              vertexShaderInstructions: [
                [
                  0,
                  "attribute vec3 POSITION;uniform mat4 renderer_MVPMat;void main(){gl_Position=renderer_MVPMat*vec4(POSITION,1.0);}"
                ]
              ],
              fragmentShaderInstructions: [
                [
                  0,
                  `
          uniform vec4 legacyInstanceColor;uniform float legacyStrength[2];
          void main() {
          #ifdef RENDERER_GPU_INSTANCE
            gl_FragColor = legacyInstanceColor * legacyStrength[1];
          #else
            gl_FragColor = vec4(0.0);
          #endif
          }
        `
                ]
              ]
            }
          ]
        }
      ]
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(asset)]));
    rhi.device.pushErrorScope("validation");
    try {
      const shader = await engine.resourceManager.load<Shader>({ url, type: AssetType.Shader });
      const root = engine.sceneManager.activeScene.createRootEntity();
      const camera = root.createChild().addComponent(Camera);
      camera.entity.transform.setPosition(0, 0, 5);
      camera.isOrthographic = true;
      camera.orthographicSize = 1;
      const target = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
      camera.renderTarget = new RenderTarget(engine, 16, 16, target);
      const mesh = PrimitiveMesh.createCuboid(engine, 0.6, 0.6, 0.6);
      const material = new Material(engine, shader);
      material.shaderData.setColor("legacyInstanceColor", new Color(1, 0, 0, 1));
      material.shaderData.setFloatArray("legacyStrength", new Float32Array([0, 1]));
      const [left, right] = [-0.5, 0.5].map((x) => {
        const renderer = root.createChild().addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setMaterial(material);
        renderer.entity.transform.setPosition(x, 0, 0);
        return renderer;
      });
      const counts: number[] = [];
      const draw = rhi.drawPrimitive.bind(rhi);
      vi.spyOn(rhi, "drawPrimitive").mockImplementation((primitive, subPrimitive, program) => {
        if (primitive === mesh._primitive) counts.push(primitive.instanceCount);
        draw(primitive, subPrimitive, program);
      });
      const pixels = new Uint8Array(16 * 4);
      async function frame() {
        counts.length = 0;
        camera.render();
        await target.getPixelBufferAsync(0, 8, 16, 1, pixels);
        expect(counts).toEqual([2]);
        return [4, 12].map((x) => Array.from(pixels.slice(x * 4, x * 4 + 4)));
      }
      const red = [255, 0, 0, 255],
        green = [0, 255, 0, 255],
        blue = [0, 0, 255, 255];
      expect(await frame()).toEqual([red, red]);
      const tint = new Color(0, 1, 0, 1);
      right.shaderData.setColor("legacyInstanceColor", tint);
      expect(await frame()).toEqual([red, green]);
      tint.set(0, 0, 1, 1);
      left.entity.transform.setPosition(0.5, 0, 0);
      right.entity.transform.setPosition(-0.5, 0, 0);
      expect(await frame()).toEqual([blue, red]);
      expect(await rhi.device.popErrorScope()).toBeNull();
    } finally {
      vi.restoreAllMocks();
      URL.revokeObjectURL(url);
      engine.destroy();
    }
  }
);

it.skipIf(!navigator.gpu)("reuses an asynchronously prepared mesh pipeline on its first camera draw", async () => {
  const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
  const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
  device.pushErrorScope("validation");
  try {
    const root = engine.sceneManager.activeScene.createRootEntity();
    const camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    const color = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const target = (camera.renderTarget = new RenderTarget(engine, 16, 16, color, TextureFormat.Depth24Stencil8));
    const renderer = root.createChild().addComponent(MeshRenderer);
    const mesh = (renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1));
    const material = new UnlitMaterial(engine);
    material.baseColor.set(1, 0, 0, 1);
    renderer.setMaterial(material);
    const pass = material.shader.subShaders[0].passes.find((p) => p.getTagValue("pipelineStage") === "Forward")!;
    const asynchronous = vi.spyOn(device, "createRenderPipelineAsync");
    await pass.preparePipeline(mesh, material, target, { camera, renderer });
    expect(asynchronous).toHaveBeenCalledTimes(1);
    const synchronous = vi.spyOn(device, "createRenderPipeline");
    camera.render();
    expect(synchronous).not.toHaveBeenCalled();
    const rgba = new Uint8Array(4);
    await color.getPixelBufferAsync(8, 8, 1, 1, rgba);
    expect([...rgba]).toEqual([255, 0, 0, 255]);
    expect(await device.popErrorScope()).toBeNull();
  } finally {
    vi.restoreAllMocks();
    engine.destroy();
  }
});

it.skipIf(!navigator.gpu)("prepares the forward attachments used by a camera rendering to the canvas", async () => {
  const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
  const { device } = engine._hardwareRenderer as WebGPUGraphicDevice;
  device.pushErrorScope("validation");
  try {
    const root = engine.sceneManager.activeScene.createRootEntity();
    const camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    // Scene and camera macros are active, but the final blit has exactly the baked shader and uniform layout.
    const translate = vi.spyOn(engine._webGPUShaderCompiler!, "compileWebGPUVariant");
    camera.render();
    expect(translate).not.toHaveBeenCalled();
    const renderer = root.createChild().addComponent(MeshRenderer);
    const mesh = (renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1));
    const material = new UnlitMaterial(engine);
    renderer.setMaterial(material);
    const pass = material.shader.subShaders[0].passes.find((p) => p.getTagValue("pipelineStage") === "Forward")!;
    const asynchronous = vi.spyOn(device, "createRenderPipelineAsync");
    await pass.preparePipeline(mesh, material, null, { camera, renderer });
    expect(translate).toHaveBeenCalled();
    expect(asynchronous).toHaveBeenCalledTimes(1);
    const synchronous = vi.spyOn(device, "createRenderPipeline");
    camera.render();
    expect(synchronous).not.toHaveBeenCalled();
    expect(await device.popErrorScope()).toBeNull();
  } finally {
    vi.restoreAllMocks();
    engine.destroy();
  }
});

it.skipIf(!navigator.gpu)("preserves application includes registered after WebGPU initialization", async () => {
  const engine = await WebGPUEngine.create({ canvas: document.createElement("canvas") });
  const key = "WebGPU/late.glsl";
  const scoped = ShaderFactory._getRuntimeIncludes([{ path: "WebGPU/scoped.glsl", source: "gpu" }]);
  try {
    ShaderFactory.registerInclude(key, "app");
    expect(scoped[key]).toBe("app");
    expect(scoped["WebGPU/scoped.glsl"]).toBe("gpu");
    expect(ShaderFactory.includeMap["WebGPU/scoped.glsl"]).toBeUndefined();
  } finally {
    ShaderFactory.unregisterInclude(key);
    engine.destroy();
  }
});
