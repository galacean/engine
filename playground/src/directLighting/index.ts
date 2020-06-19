import { vec3, vec4 } from "@alipay/o3-math";
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { SphereGeometry, CuboidGeometry } from "@alipay/o3-geometry-shape";
import { ResourceLoader } from "@alipay/o3-loader";
import "@alipay/o3-engine-stats";

import { ADirectLight } from "@alipay/o3-lighting";
import { BlinnPhongMaterial } from "@alipay/o3-mobile-material";
import { AOrbitControls } from "@alipay/o3-orbit-controls";

import ARotation from "../common/ARotation";

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create a rotating light
let light = rootNode.createChild("light");
light.createAbility(ADirectLight, {
  color: vec3.fromValues(0.4, 0.6, 0.75),
  intensity: 0.8
});
light.position = [0, 0, 1];
light.lookAt([0, 0, 0], [0, 1, 0]);
console.log(light.getModelMatrix());
// light.setRotationAngles(180, 0, 0);
// console.log(light.getModelMatrix());

//-- create geometry objects
let mtl = new BlinnPhongMaterial("test_mtl2");
mtl.ambient = vec4.fromValues(0.75, 0.25, 0.25, 1);
mtl.shininess = 10;
let obj1 = rootNode.createChild("obj1");
obj1.position = [2, 0, 0];
obj1.setRotationAngles(0, -20, 0);
let sphereRenderer1 = obj1.createAbility(AGeometryRenderer);
sphereRenderer1.geometry = new SphereGeometry(1.6, 32, 32);
sphereRenderer1.setMaterial(mtl);

const w = 2;
let obj2 = rootNode.createChild("obj2");
obj2.position = [-2, -2, 0];
obj2.setRotationAngles(0, 30, 0);
let cubeRenderer2 = obj2.createAbility(AGeometryRenderer);
cubeRenderer2.geometry = new CuboidGeometry(w, w, w);
cubeRenderer2.setMaterial(mtl);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 10],
  near: 0.1,
  far: 100
});
cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });

//-- run
engine.run();
