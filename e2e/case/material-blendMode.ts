/**
 * @title Blend Mode
 * @category Material
 */
import { Camera, GLTFResource, Vector3, WebGLEngine } from "@galacean/engine";
import { e2eReady, initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 1, 10);
  const camera = cameraEntity.addComponent(Camera);

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/d099b30b-59a3-42e4-99eb-b158afa8e65d.glb")
    .then((glTF) => {
      rootEntity.addChild(glTF.defaultSceneRoot);
      updateForE2E(engine);
      const category = "Material";
      const name = "material-blendMode";
      initScreenshot(category, name, engine, camera);
    });
});
