/**
 * @title Shadow Fade
 * @category Light
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*YIXASLTf0CkAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Animator,
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  ShadowResolution,
  ShadowType,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

const gui = new dat.GUI();
/**
 * Planar Shadow
 */

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.shadowResolution = ShadowResolution.VeryHigh;
  scene.shadowDistance = 10;

  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.setPosition(0, 5, 7);
  const camera = cameraEntity.addComponent(Camera);

  const control = cameraEntity.addComponent(OrbitControl);
  control.target = new Vector3(0, 0, 0);
  control.zoomSpeed = 0.2;
  const lightEntity = rootEntity.createChild("light_node");
  const light = lightEntity.addComponent(DirectLight);
  lightEntity.transform.setPosition(-10, 10, 10);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  light.shadowType = ShadowType.SoftHigh;

  const planeEntity = rootEntity.createChild("plane_node");
  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
  const planeMaterial = new PBRMaterial(engine);
  renderer.setMaterial(planeMaterial);

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb")
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      rootEntity.addChild(defaultSceneRoot);

      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play(asset.animations[0].name);
    });

  engine.run();

  gui.add(scene, "shadowFadeBorder", 0, 1, 0.01);
  gui.add(scene, "shadowDistance", 0, 100, 1);
  gui.add(light, "shadowStrength", 0, 1, 0.01);
});
