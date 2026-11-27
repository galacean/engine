import { expect, it } from "vitest";
import { WebGLEngine } from "@galacean/engine";
import {
  Camera,
  CubeProbe,
  MeshRenderer,
  PrimitiveMesh,
  type TextureCube,
  UnlitMaterial,
  WebGPUEngine,
  type WebGPUGraphicDevice
} from "@galacean/engine-webgpu";

it.skipIf(!navigator.gpu)(
  "renders all six dynamic probe faces and preserves the previous environment on both backends",
  async () => {
    const faces = [
      [3, 0, 0, 1, 0, 0],
      [-3, 0, 0, 0, 1, 0],
      [0, 3, 0, 0, 0, 1],
      [0, -3, 0, 1, 1, 0],
      [0, 0, 3, 1, 0, 1],
      [0, 0, -3, 0, 1, 1]
    ];
    for (const backend of [WebGLEngine, WebGPUEngine]) {
      const engine = await backend.create({ canvas: document.createElement("canvas") });
      engine.canvas.setResolution(32, 32);
      const device =
        engine instanceof WebGPUEngine ? (engine._hardwareRenderer as WebGPUGraphicDevice).device : undefined;
      device?.pushErrorScope("validation");
      try {
        const root = engine.sceneManager.activeScene.createRootEntity();
        const camera = root.createChild().addComponent(Camera);
        const probe = camera.entity.addComponent(CubeProbe);
        probe.width = probe.height = 16;
        probe.antiAliasing = 4;
        const captured: TextureCube[] = [];
        probe.onTextureChange = (texture) => captured.push(texture as TextureCube);
        const mesh = PrimitiveMesh.createCuboid(engine, 1.5, 1.5, 1.5);
        const materials = faces.map(([x, y, z, r, g, b]) => {
          const entity = root.createChild();
          entity.transform.setPosition(x, y, z);
          const renderer = entity.addComponent(MeshRenderer);
          renderer.mesh = mesh;
          const material = new UnlitMaterial(engine);
          material.baseColor.set(r, g, b, 1);
          renderer.setMaterial(material);
          return material;
        });
        const pixel = async (texture: TextureCube, face: number) => {
          const out = new Uint8Array(4);
          await texture.getPixelBufferAsync(face, 8, 8, 1, 1, out);
          return Array.from(out);
        };
        engine.update();
        for (const [i, [, , , r, g, b]] of faces.entries()) {
          expect(await pixel(captured[0], i), backend.name + " face " + i).toEqual([r * 255, g * 255, b * 255, 255]);
        }
        materials[0].baseColor.set(0, 0, 1, 1);
        engine.update();
        expect(captured[1]).not.toBe(captured[0]);
        expect(await pixel(captured[0], 0)).toEqual([255, 0, 0, 255]);
        expect(await pixel(captured[1], 0)).toEqual([0, 0, 255, 255]);
        expect(await device?.popErrorScope()).toBeFalsy();
      } finally {
        engine.destroy();
      }
    }
  }
);
