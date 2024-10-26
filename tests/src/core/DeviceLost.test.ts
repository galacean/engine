import { BlinnPhongMaterial, Camera, DirectLight, MeshRenderer, PrimitiveMesh } from "@galacean/engine-core";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";

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

    // Force lost device.
    engine.forceLoseDevice();

    // Wait for 1 second to restore device.
    await new Promise((resolve) => {
      setTimeout(() => {
        engine.forceRestoreDevice();
        resolve(null);
      }, 1000);
    });
  });
});
