import { expect, it, vi } from "vitest";
import {
  Camera,
  Color,
  MeshRenderer,
  PrimitiveMesh,
  RenderQueueType,
  RenderStateElementKey,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { UnlitSource } from "@galacean/engine-shader";
import { TerrainRenderer } from "../../../packages/terrain/src/terrain/TerrainRenderer";
import { installSeedWorldGrassDrawOrder } from "../../demos/seed-world/src/SeedWorldGrassDrawOrder";

it("orders grass before terrain only on the depth-backed main camera with active grass", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  try {
    const scene = engine.sceneManager.activeScene;
    const eye = scene.createRootEntity("camera");
    eye.transform.setPosition(0, 0, 5);
    const camera = eye.addComponent(Camera);
    camera.enablePostProcess = false;

    const terrain = scene.createRootEntity("terrain").addComponent(TerrainRenderer);
    const terrainMaterial = new UnlitMaterial(engine);
    terrainMaterial.baseColor.copyFrom(new Color(1, 0, 0, 1));
    terrain.setMaterial(terrainMaterial);
    const terrainMesh = (terrain.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1));
    terrain.priority = -103;

    const grass = scene.createRootEntity("grass").addComponent(MeshRenderer);
    grass.entity.transform.setPosition(0, 0, 0.5);
    const grassShader = structuredClone(UnlitSource);
    grassShader.name = "GrassDrawOrderTest";
    const pass = grassShader.subShaders[0]!.passes.find((pass) => pass.tags?.pipelineStage === "Forward")!;
    const queueKey = RenderStateElementKey.RenderQueueType;
    delete pass.renderStates.variableMap[queueKey];
    pass.renderStates.constantMap[queueKey] = RenderQueueType.AlphaTest;
    const grassMaterial = new UnlitMaterial(engine);
    grassMaterial.shader = Shader._createFromPrecompiled(grassShader);
    grassMaterial.baseColor.copyFrom(new Color(0, 1, 0, 1));
    grassMaterial.alphaCutoff = 0.5;
    grass.setMaterial(grassMaterial);
    const grassMesh = (grass.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1));
    grassMesh.instanceCount = 1;

    const building = scene.createRootEntity("building").addComponent(MeshRenderer);
    building.entity.transform.setPosition(0, 0, -0.5);
    building.setMaterial(new UnlitMaterial(engine));
    const buildingMesh = (building.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1));

    const hardware = engine._hardwareRenderer;
    const order: string[] = [];
    const draw = hardware.drawPrimitive;
    vi.spyOn(hardware, "drawPrimitive").mockImplementation(function (...args) {
      if (args[0] === grassMesh._primitive) order.push("grass");
      if (args[0] === terrainMesh._primitive) order.push("terrain");
      if (args[0] === buildingMesh._primitive) order.push("building");
      return draw.apply(hardware, args);
    });
    const visitTerrain = vi.fn((visit: (renderer: TerrainRenderer) => void) => visit(terrain));
    const restore = installSeedWorldGrassDrawOrder(camera, () => ({
      population: { visitForwardGrassRenderers: (visit) => visit(grass) },
      clipmap: { visitRenderers: visitTerrain }
    }));
    try {
      const pixel = new Uint8Array(4);
      grass.enabled = false;
      camera.render();
      hardware.gl.readPixels(32, 32, 1, 1, hardware.gl.RGBA, hardware.gl.UNSIGNED_BYTE, pixel);
      expect(visitTerrain).not.toHaveBeenCalled();
      expect(order).toEqual(["terrain", "building"]);
      expect([...pixel]).toEqual([255, 0, 0, 255]);

      order.length = 0;
      grass.enabled = true;
      camera.render();
      hardware.gl.readPixels(32, 32, 1, 1, hardware.gl.RGBA, hardware.gl.UNSIGNED_BYTE, pixel);
      expect(order).toEqual(["building", "grass", "terrain"]);
      expect([...pixel]).toEqual([0, 255, 0, 255]);
      expect([grass.priority, terrain.priority]).toEqual([0, -103]);
      expect(grass.getMaterial()!.shaderData.getFloat("material_GrassRenderQueue")).toBe(RenderQueueType.AlphaTest);

      order.length = 0;
      const color = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
      camera.renderTarget = new RenderTarget(engine, 64, 64, color, null, 1);
      camera.render();
      color.getPixelBuffer(32, 32, 1, 1, 0, pixel);
      expect(order).toEqual(["terrain", "building", "grass"]);
      expect([...pixel]).toEqual([0, 255, 0, 255]);
    } finally {
      restore();
    }
  } finally {
    engine.destroy();
  }
});
