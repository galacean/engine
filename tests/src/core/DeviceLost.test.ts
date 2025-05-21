import { AmbientLight, AssetType, BlinnPhongMaterial, Camera, DirectLight, MeshRenderer, PrimitiveMesh, Texture2D, TextureCube } from "@galacean/engine-core";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, expect, it } from "vitest";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Device lost test", function () {
  it("Force lost and restore test", async () => {
    const engine = await WebGLEngine.create({ canvas: canvasDOM });
    engine.canvas.resizeByClientSize();

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
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*t1inRbPh6VQAAAAAAAAAAAAADkp5AQ/ambient.json",
      type: AssetType.Env
    })
    const textureCube = await engine.resourceManager.load<TextureCube>({
      url: "https://gw.alipayobjects.com/os/bmw-prod/10c5d68d-8580-4bd9-8795-6f1035782b94.bin", // sunset_1K
      type: AssetType.HDR
    })
    const ktx2Texture = await resourceManager.load<Texture2D>(
      {
        url: "https://mdn.alipayobjects.com/oasis_be/afts/img/A*iaD4QaUJRKoAAAAAAAAAAAAADkp5AQ/original/DefaultTexture.ktx2",
        type: AssetType.KTX2
      }
    )
    const editorTexture = await resourceManager.load<Texture2D>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*YTAfSrgMrt0AAAAAAAAAAAAADkp5AQ/DefaultTexture.json",
      type: "EditorTexture2D"
    })


    await new Promise((resolve) => {
      // Listening context devicelost and devicerestored
      console.log('new Promise');
      engine.once("devicelost", () => {
        console.log('context lost');
        engine.once("devicerestored", () => {
          console.log('context restored');
          resolve(null);
        });
        // 模拟器不支持上下文恢复，此处直接调用代码模拟丢失与恢复
        // @ts-ignore
        engine._onDeviceRestored();
      });
      // @ts-ignore
      engine._onDeviceLost();
    })

    expect(ambientLight.specularTexture.isContentLost).to.equal(false);
    expect(ktx2Texture.isContentLost).to.equal(false);
    expect(textureCube.isContentLost).to.equal(false);
    expect(editorTexture.isContentLost).to.equal(false);

  });
});
