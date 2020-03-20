import {
  ADefaultCamera,
  AGeometryRenderer,
  Engine,
  EngineFeature,
  BasicSceneRenderer,
  MaskList,
  PlaneGeometry,
  APointLight,
  BlinnPhongMaterial,
  CuboidGeometry,
  AOrbitControls
} from "@alipay/o3";
import { MRTSceneRenderer } from "./MRTSceneRenderer";

const engine = new Engine();
const root = engine.currentScene.root;
const camera = root.createChild("camera");
const cameraAbility = camera.createAbility(ADefaultCamera, {
  canvas: 'o3-demo',
  position: [0, 0, 10],
  target: [0, 0, 0],
  SceneRenderer: MRTSceneRenderer,
  attributes: {
    disableWebGL2: true
  }
});
camera.createAbility(AOrbitControls);
// cameraAbility.sceneRendere.defaultRenderPass.mask = MaskList.MASK1;

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
root.scene.features.shift();
root.scene.features.pop();

const geometry1 = new PlaneGeometry(2.0, 2.0);
const planeNode = root.createChild("plane");
const plane = planeNode.createAbility(AGeometryRenderer, {
  geometry: geometry1,
  material
});

plane.renderPassFlag = MaskList.MASK2;

engine.tick();