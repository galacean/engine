/**
 * @title input-pointerButton
 * @category input
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*ytliRpOHgvgAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PointerButton,
  PrimitiveMesh,
  Script,
  TextRenderer,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";

// Create engine
WebGLEngine.create({ canvas: "canvas", physics: new LitePhysics() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize();
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    // add light
    const lightEntity = rootEntity.createChild("light");
    lightEntity.addComponent(DirectLight);
    lightEntity.transform.setRotation(-45, 0, 0);

    // init camera
    const cameraEntity = rootEntity.createChild("camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(10, 10, 10);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

    // init box
    const boxEntity = rootEntity.createChild("box");
    const renderer = boxEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    renderer.setMaterial(new PBRMaterial(engine));
    boxEntity.addComponent(RotateScript);

    // add tip
    const textEntity = rootEntity.createChild("text");
    textEntity.transform.rotationQuaternion =
      cameraEntity.transform.rotationQuaternion;
    textEntity.transform.setPosition(0, 5, 0);
    textEntity.transform.setScale(2, 2, 2);
    const textRenderer = textEntity.addComponent(TextRenderer);
    textRenderer.fontSize = 40;
    textRenderer.text =
      "Hold down the 'Primary'  to rotate left\nHold down the 'Secondary' to rotate right\n";

    // Run engine
    engine.run();
  }
);

class RotateScript extends Script {
  onUpdate(deltaTime: number): void {
    const { engine, entity } = this;
    if (engine.inputManager.isPointerHeldDown(PointerButton.Primary)) {
      entity.transform.rotate(0, -1, 0);
    }
    if (engine.inputManager.isPointerHeldDown(PointerButton.Secondary)) {
      entity.transform.rotate(0, 1, 0);
    }
  }
}
