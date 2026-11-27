import {
  AmbientLight,
  AssetType,
  BlinnPhongMaterial,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Camera,
  DirectLight,
  EngineEventType,
  MeshRenderer,
  PrimitiveMesh,
  Texture2D,
  TextureFormat,
  TextureCube
} from "@galacean/engine-core";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { describe, expect, it } from "vitest";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Device lost test", function () {
  it("Force lost and restore test", async () => {
    const engine = await WebGLEngine.create({ canvas: canvasDOM });

    // Get scene and create root entity.
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("Root");

    // Create light.
    const lightEntity = rootEntity.createChild("Light");
    const directLight = lightEntity.addComponent(DirectLight);
    lightEntity.transform.setRotation(-45, -45, 0);
    directLight.intensity = 0.4;

    // Create camera.
    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, 12);

    // Create sphere.
    const meshEntity = rootEntity.createChild("Sphere");
    const meshRenderer = meshEntity.addComponent(MeshRenderer);
    const material = new BlinnPhongMaterial(engine);
    meshRenderer.setMaterial(material);
    meshRenderer.mesh = PrimitiveMesh.createSphere(engine, 1);

    engine.update();

    const resourceManager = engine.resourceManager;

    // 注意：以下部分文件可能会版本迭代而解析报错，若出现此情况，只需更新对应版本的编辑器资产文件即可
    const ambientLight = await resourceManager.load<AmbientLight>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*kY8wSIrDC2gAAAAAgBAAAAgAekp5AQ/ambient.ambLight",
      type: AssetType.AmbientLight
    });
    const textureCube = await engine.resourceManager.load<TextureCube>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*dKYuQKLX9M4AAAAAgBAAAAgAekp5AQ/kloofendal_48d_partly_cloudy_puresky_1k.tex",
      type: AssetType.Texture
    });
    const ktx2Texture = await resourceManager.load<Texture2D>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/img/A*iaD4QaUJRKoAAAAAAAAAAAAADkp5AQ/original/DefaultTexture.ktx2",
      type: AssetType.KTX2
    });
    const editorTexture = await resourceManager.load<Texture2D>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*mePuTKQ_vzoAAAAAQKAAAAgAekp5AQ/20260305153504.tex",
      type: AssetType.Texture
    });

    await new Promise((resolve) => {
      // Listening context devicelost and devicerestored
      console.log("new Promise");
      engine.once("devicelost", () => {
        console.log("context lost");
        engine.once("devicerestored", () => {
          console.log("context restored");
          resolve(null);
        });
        // 模拟器不支持上下文恢复，此处直接调用代码模拟丢失与恢复
        // @ts-ignore
        engine._onDeviceRestored();
      });
      // @ts-ignore
      engine._onDeviceLost();
    });

    expect(ambientLight.specularTexture.isContentLost).to.equal(false);
    expect(ktx2Texture.isContentLost).to.equal(false);
    expect(textureCube.isContentLost).to.equal(false);
    expect(editorTexture.isContentLost).to.equal(false);
    engine.destroy();
  });

  it("preserves isContentLost across lost-context writes, restores readable buffers, and replaces platform primitives", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const engine = await WebGLEngine.create({ canvas });
    try {
      const scene = engine.sceneManager.activeScene;
      const root = scene.createRootEntity("Root");
      const camera = root.createChild("Camera").addComponent(Camera);
      camera.entity.transform.setPosition(0, 0, 5);
      const meshEntity = root.createChild("Box");
      const renderer = meshEntity.addComponent(MeshRenderer);
      const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      renderer.mesh = mesh;
      renderer.setMaterial(new BlinnPhongMaterial(engine));

      const dynamicBuf = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        new Float32Array([1, 2, 3, 4]),
        BufferUsage.Dynamic
      );
      const readableBuf = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        new Float32Array([5, 6, 7, 8]),
        BufferUsage.Static,
        true
      );
      const dynamicTex = new Texture2D(engine, 2, 2, TextureFormat.R8G8B8A8_UNorm, false, false);
      const texPixels = new Uint8Array(16).fill(200);
      dynamicTex.setPixelBuffer(texPixels);

      engine.update();
      const platformPrimitiveBefore = (mesh as any)._primitive._platformPrimitive;

      await new Promise<void>((resolve, reject) => {
        engine.once(EngineEventType.DeviceLost, () => {
          try {
            // Simulates script updates writing to GPU resources while the WebGL context is still lost.
            dynamicBuf.setData(new Float32Array([9, 10, 11, 12]));
            dynamicTex.setPixelBuffer(texPixels);
            expect(dynamicBuf.isContentLost).to.equal(true);
            expect(dynamicTex.isContentLost).to.equal(true);

            engine.once(EngineEventType.DeviceRestored, () => resolve());
            setTimeout(() => engine.forceRestoreDevice(), 0);
          } catch (err) {
            reject(err);
          }
        });
        engine.forceLoseDevice();
      });

      expect(dynamicBuf.isContentLost).to.equal(true);
      expect(dynamicTex.isContentLost).to.equal(true);
      expect(readableBuf.isContentLost).to.equal(false);

      const readBack = new Float32Array(4);
      readableBuf.getData(readBack);
      expect(Array.from(readBack)).to.deep.equal([5, 6, 7, 8]);

      expect((mesh as any)._primitive._platformPrimitive).not.to.equal(platformPrimitiveBefore);

      dynamicBuf.setData(new Float32Array([1, 2, 3, 4]));
      dynamicTex.setPixelBuffer(texPixels);
      expect(dynamicBuf.isContentLost).to.equal(false);
      expect(dynamicTex.isContentLost).to.equal(false);

      engine.update();
      expect(canvas.getContext("webgl2")!.getError()).to.equal(0);

      dynamicBuf.destroy(true);
      readableBuf.destroy(true);
      dynamicTex.destroy(true);
    } finally {
      engine.destroy();
    }
  });
});
