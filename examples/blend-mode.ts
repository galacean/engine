/**
 * @title Blend Mode
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*onv4TaXhKnUAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  Camera,
  GLTFResource,
  PBRMaterial,
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
  cameraEntity.transform.position = new Vector3(0, 3, 10);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/d099b30b-59a3-42e4-99eb-b158afa8e65d.glb"
    )
    .then((asset) => {
      const { defaultSceneRoot, materials } = asset;
      rootEntity.addChild(defaultSceneRoot);

      const state = {
        alphaCutoff: 0,
        isTransparent: false,
        opacity: 0,
      };

      // Do not debug first material
      const debugMaterials = materials.slice(1);
      gui.add(state, "alphaCutoff", 0, 1, 0.01).onChange((v) => {
        debugMaterials.forEach((material) => {
          (material as PBRMaterial).alphaCutoff = v;
        });
      });

      gui.add(state, "isTransparent").onChange((v) => {
        debugMaterials.forEach((material) => {
          (material as PBRMaterial).isTransparent = v;
        });
      });

      gui.add(state, "opacity", 0, 1, 0.01).onChange((v) => {
        debugMaterials.forEach((material) => {
          (material as PBRMaterial).baseColor.a = v;
        });
      });
    });

  engine.run();
});
