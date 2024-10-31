/**
 * @title input-wheel
 * @category input
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*Twx0TY-OTjIAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  DirectLight,
  MathUtil,
  MeshRenderer,
  PrimitiveMesh,
  Script,
  TextRenderer,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { WireframeManager } from "@galacean/engine-toolkit";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  engine.canvas._webCanvas.style.touchAction = "none";
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  // init main camera
  const mainCameraEntity = rootEntity.createChild("camera");
  const mainCamera = mainCameraEntity.addComponent(Camera);
  mainCameraEntity.transform.setPosition(0, 0, 20);
  mainCamera.fieldOfView = 30;
  mainCamera.nearClipPlane = 3;
  mainCamera.farClipPlane = 35;
  // add wire frame
  rootEntity.addComponent(MeshRenderer);
  rootEntity.addComponent(WireframeManager).addCameraWireframe(mainCamera);

  const boxEntity = rootEntity.createChild("box");
  const renderer = boxEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  renderer.setMaterial(new UnlitMaterial(engine));
  boxEntity.addComponent(
    class extends Script {
      onUpdate(deltaTime: number): void {
        const rad = engine.time.actualElapsedTime;
        boxEntity.transform.rotate(Math.sin(rad), Math.cos(rad), 0);
      }
    }
  );

  // init side camera
  const sideCameraEntity = rootEntity.createChild("sideCamera");
  const sideCamera = sideCameraEntity.addComponent(Camera);
  sideCamera.priority = 1;
  sideCamera.viewport.set(0, 0.6, 0.4, 0.4);
  sideCameraEntity.transform.setPosition(-50, 0, -5);
  sideCameraEntity.transform.setRotation(0, -90, 0);
  sideCameraEntity.addComponent(
    class extends Script {
      onBeginRender(camera: Camera): void {
        scene.background.solidColor.set(0, 0, 0, 1);
      }
      onEndRender(camera: Camera): void {
        scene.background.solidColor.set(0.25, 0.25, 0.25, 1.0);
      }
    }
  );

  // add tip
  const textEntity = rootEntity.createChild("text");
  textEntity.transform.setPosition(0, 3, 0);
  textEntity.transform.setScale(2, 2, 2);
  const textRenderer = textEntity.addComponent(TextRenderer);
  textRenderer.fontSize = 30;
  textRenderer.text = "Use the wheel to control the distance of the camera";

  rootEntity.addComponent(
    class extends Script {
      onUpdate(deltaTime: number): void {
        const { wheelDelta } = engine.inputManager;
        if (wheelDelta) {
          const { position } = mainCameraEntity.transform;
          position.z = MathUtil.clamp(position.z - wheelDelta.y / 100, 0, 40);
        }
      }
    }
  );

  // Run engine
  engine.run();
});
