/**
 * @title Unlit Material
 * @category Material
 */
import { Camera, GLTFResource, Vector3, WebGLEngine, Logger } from "@galacean/engine";
import { e2eReady, updateForE2E } from "./.mockForE2E";
Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 5);
  cameraEntity.addComponent(Camera);

  engine.run();

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/8d36415b-5905-461f-9336-68a23d41518e.gltf")
    .then((gltf) => {
      rootEntity.addChild(gltf.defaultSceneRoot);
      updateForE2E(engine);
      e2eReady();
    });
});
