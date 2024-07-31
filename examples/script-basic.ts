/**
 * @title Script Basic
 * @category Basic
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*cHnfTJxLtpkAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Camera,
  GLTFResource,
  Script,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(3, 3, 3);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(OrbitControl);

  engine.sceneManager.activeScene.ambientLight.diffuseSolidColor.set(
    1,
    1,
    1,
    1
  );

  // Create Rotate Script
  class Rotate extends Script {
    private _tempVector = new Vector3(0, 1, 0);
    onUpdate() {
      this.entity.transform.rotate(this._tempVector);
    }
  }

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/267000040/9994/%25E5%25BD%2592%25E6%25A1%25A3.gltf"
    )
    .then((gltf) => {
      const duck = gltf.defaultSceneRoot;

      rootEntity.addChild(duck);

      // Add Script
      duck.addComponent(Rotate);
    });

  engine.run();
});
