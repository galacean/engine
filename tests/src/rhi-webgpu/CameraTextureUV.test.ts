import { expect, it } from "vitest";
import { WebGLEngine } from "@galacean/engine";
import {
  Camera,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  UnlitMaterial,
  WebGPUEngine
} from "@galacean/engine-webgpu";

it.skipIf(!navigator.gpu).each(["occlusion", "transmission"])(
  "samples PBR camera %s at the matching canvas and render target rows on both backends",
  async (effect) => {
    for (const backend of [WebGLEngine, WebGPUEngine]) {
      const canvas = document.createElement("canvas");
      const engine = await backend.create({ canvas });
      try {
        engine.canvas.setResolution(16, 16);
        const scene = engine.sceneManager.activeScene;
        scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);
        const root = scene.createRootEntity();
        const camera = root.createChild().addComponent(Camera);
        camera.entity.transform.setPosition(0, 0, 3);
        camera.isOrthographic = true;
        camera.orthographicSize = 1;
        const output = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
        const target = new RenderTarget(engine, 16, 16, output, TextureFormat.Depth24Stencil8);
        const renderer = root.createChild().addComponent(MeshRenderer);
        renderer.mesh = PrimitiveMesh.createCuboid(engine, 3, 3, 0.2);
        const material = new PBRMaterial(engine);
        material.metallic = 0;
        renderer.setMaterial(material);

        if (effect === "occlusion") {
          // Feed the PBR consumer two distinct rows independently of the SAO producer and its noise.
          const ao = new Texture2D(engine, 1, 2, TextureFormat.R8G8B8A8_UNorm, false, false);
          ao.filterMode = TextureFilterMode.Point;
          ao.setPixelBuffer(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]));
          scene.shaderData.enableMacro("SCENE_ENABLE_AMBIENT_OCCLUSION");
          camera.shaderData.setTexture("camera_AOTexture", ao);
        } else {
          camera.opaqueTextureEnabled = true;
          material.transmission = 1;
          material.ior = 1;
          material.roughness = 0;
          material.baseColor.set(0.65, 0.65, 0.65, 1);
          const backdropMesh = PrimitiveMesh.createCuboid(engine, 3, 1, 0.2);
          for (const y of [-0.5, 0.5]) {
            const entity = root.createChild();
            entity.transform.setPosition(0, y, -1);
            const backdrop = entity.addComponent(MeshRenderer);
            backdrop.mesh = backdropMesh;
            const color = new UnlitMaterial(engine);
            color.baseColor.set(y > 0 ? 1 : 0, y < 0 ? 1 : 0, 0, 1);
            backdrop.setMaterial(color);
          }
        }
        for (const destination of [target, null]) {
          camera.renderTarget = destination;
          engine.update();
          let rows: Uint8Array | Uint8ClampedArray;
          if (destination) {
            rows = new Uint8Array(16 * 16 * 4);
            await output.getPixelBufferAsync(rows);
          } else {
            const image = document.createElement("canvas");
            image.width = image.height = 16;
            const context = image.getContext("2d")!;
            context.drawImage(canvas, 0, 0);
            rows = context.getImageData(0, 0, 16, 16).data;
          }
          const upper = (3 * 16 + 8) * 4,
            lower = (12 * 16 + 8) * 4;
          const label = backend.name + (destination ? " render target" : " canvas");
          if (effect === "occlusion") {
            expect(rows[upper], label + " dark row").toBeLessThan(5);
            expect(rows[lower], label + " lit row").toBeGreaterThan(60);
          } else {
            expect(rows[upper] - rows[upper + 1], label + " red through glass").toBeGreaterThan(40);
            expect(rows[lower + 1] - rows[lower], label + " green through glass").toBeGreaterThan(40);
            expect(rows[upper], label + " tinted glass").toBeLessThan(240);
          }
        }
      } finally {
        engine.destroy();
      }
    }
  }
);
