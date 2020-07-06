import { Engine, Scene } from "@alipay/o3-core";
import { APointLight, LightFeature } from "@alipay/o3-lighting";
import { BlinnPhongMaterial } from "@alipay/o3-mobile-material";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { CuboidGeometry, PlaneGeometry } from "@alipay/o3-geometry-shape";
import { MaskList, Logger } from "@alipay/o3-base";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { ADefaultCamera } from "@alipay/o3-default-camera";

import { MRTSceneRenderer } from "./MRTSceneRenderer";
Logger.enable();
Scene.registerFeature(LightFeature);

const engine = new Engine();
const root = engine.currentScene.root;
const camera = root.createChild("camera");
const cameraAbility = camera.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 10],
  target: [0, 0, 0],
  SceneRenderer: MRTSceneRenderer,
  attributes: {
    disableWebGL2: false
  }
});
camera.createAbility(AOrbitControls);

const box = root.createChild("box");
box.position = [-2, -2, 0];
const geometry = new CuboidGeometry(1, 1, 1);
const material = new BlinnPhongMaterial("adc");
material.shininess = 1;
material.diffuse = [0.5, 0.5, 1.0, 1.0];
// material.emission = [0, 1, 1, 1];
const renderer = box.createAbility(AGeometryRenderer, {
  geometry,
  material
});

renderer.renderPassFlag = MaskList.MASK1;

const light = root.createChild("light");
light.position = [0, -2, -2];
light.createAbility(APointLight, {
  distance: 5.0,
  decay: 0.3
});
// root.scene.features.shift();
// root.scene.features.pop();
// console.log(root.scene.constructor === Scene);

const geometry1 = new PlaneGeometry(2.0, 2.0);
const planeNode = root.createChild("plane");
const plane = planeNode.createAbility(AGeometryRenderer, {
  geometry: geometry1,
  material
});

plane.renderPassFlag = MaskList.MASK2;

engine.run();
