import {
  BlinnPhongMaterial,
  Camera,
  Color,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterEach, describe, expect, it } from "vitest";

describe("Built-in shader vertex color regressions", () => {
  let engine: WebGLEngine | null = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  function renderVertexColorCube(
    materialFactory: (eng: WebGLEngine) => UnlitMaterial | BlinnPhongMaterial,
    options?: {
      vertexColor?: Color;
      enableVertexColor?: boolean;
      setupScene?: (eng: WebGLEngine) => void;
    }
  ): Promise<Uint8Array> {
    return (async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      engine = await WebGLEngine.create({ canvas });

      const scene = engine.sceneManager.activeScene;
      scene.background.solidColor = new Color(0, 0, 0, 1);
      options?.setupScene?.(engine);

      const cameraEntity = scene.createRootEntity("camera");
      const camera = cameraEntity.addComponent(Camera);
      camera.enableHDR = false;
      camera.isOrthographic = true;
      camera.orthographicSize = 1;
      cameraEntity.transform.setPosition(0, 0, 5);
      cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

      const colorTexture = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8, false, true);
      const renderTarget = new RenderTarget(engine, 64, 64, colorTexture, TextureFormat.Depth16);
      camera.renderTarget = renderTarget;

      const vertexColor = options?.vertexColor ?? new Color(1, 0, 0, 1);
      const mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 1, { keepMeshData: true });
      mesh.setColors(Array.from({ length: mesh.vertexCount }, () => vertexColor.clone()));
      mesh.uploadData(false);

      const cubeEntity = scene.createRootEntity("cube");
      const renderer = cubeEntity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.enableVertexColor = options?.enableVertexColor ?? true;
      const material = materialFactory(engine);
      material.baseColor = new Color(1, 1, 1, 1);
      renderer.setMaterial(material);

      camera.render();

      const pixel = new Uint8Array(4);
      colorTexture.getPixelBuffer(32, 32, 1, 1, 0, pixel);

      camera.renderTarget = null;
      renderTarget.destroy();
      colorTexture.destroy();
      return pixel;
    })();
  }

  it("multiplies enabled vertex color into UnlitMaterial output", async () => {
    const pixel = await renderVertexColorCube((eng) => new UnlitMaterial(eng));
    expect(pixel[0]).toBeGreaterThan(240);
    expect(pixel[1]).toBeLessThan(10);
    expect(pixel[2]).toBeLessThan(10);
  });

  it("ignores vertex color on UnlitMaterial when enableVertexColor is false", async () => {
    const pixel = await renderVertexColorCube((eng) => new UnlitMaterial(eng), {
      enableVertexColor: false
    });
    expect(pixel[0]).toBeGreaterThan(240);
    expect(pixel[1]).toBeGreaterThan(240);
    expect(pixel[2]).toBeGreaterThan(240);
  });

  it("applies vertex color alpha before alpha cutoff in UnlitMaterial", async () => {
    const pixel = await renderVertexColorCube(
      (eng) => {
        const mat = new UnlitMaterial(eng);
        mat.alphaCutoff = 0.5;
        return mat;
      },
      { vertexColor: new Color(1, 0, 0, 0.2) }
    );
    // Discarded fragment should show black background (0, 0, 0)
    expect(pixel[0]).toBeLessThan(10);
    expect(pixel[1]).toBeLessThan(10);
    expect(pixel[2]).toBeLessThan(10);
  });

  it("applies vertex color to the BlinnPhongMaterial ambient lighting term", async () => {
    const pixel = await renderVertexColorCube((eng) => new BlinnPhongMaterial(eng), {
      setupScene: (eng) => {
        const scene = eng.sceneManager.activeScene;
        scene.ambientLight.diffuseSolidColor = new Color(1, 1, 1, 1);
        scene.ambientLight.diffuseIntensity = 0.5;
      }
    });
    expect(pixel[0]).toBeGreaterThan(150);
    expect(pixel[1]).toBeLessThan(10);
    expect(pixel[2]).toBeLessThan(10);
  });
});
