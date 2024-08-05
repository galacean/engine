/**
 * @title Unlit Material
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*nWlHSZjfBc0AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  Animator,
  Camera,
  GLTFResource,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
const gui = new dat.GUI();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 5);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  engine.run();

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/8d36415b-5905-461f-9336-68a23d41518e.gltf"
    )
    .then((gltf) => {
      const { materials, animations, defaultSceneRoot } = gltf;
      rootEntity.addChild(defaultSceneRoot);

      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play(animations[0].name);
      addGUI(materials as UnlitMaterial[]);
    });

  function addGUI(materials: UnlitMaterial[]) {
    const state = {
      baseColor: [255, 255, 255],
    };

    gui.addColor(state, "baseColor").onChange((v) => {
      materials.forEach((material) => {
        material.baseColor.set(v[0] / 255, v[1] / 255, v[2] / 255, 1);
      });
    });
  }
});
