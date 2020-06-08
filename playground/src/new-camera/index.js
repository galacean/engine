import { vec3, vec4 } from "@alipay/o3-math";
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera, StandardCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { SphereGeometry, CuboidGeometry } from "@alipay/o3-geometry-shape";
import "@alipay/o3-engine-stats";

import { ConstantMaterial } from "@alipay/o3-mobile-material";
import { AOrbitControls } from "@alipay/o3-orbit-controls";

//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;
// light.setRotationAngles(180, 0, 0);
// console.log(light.getModelMatrix());

//-- create geometry objects
let mtl = new ConstantMaterial("test_mtl2", false);
mtl.emission = [0.2, 0.6, 0.6, 1]
// let obj1 = rootNode.createChild("obj1");
// obj1.position = [2, 0, 0];
// obj1.setRotationAngles(0, -20, 0);
// let sphereRenderer1 = obj1.createAbility(AGeometryRenderer);
// sphereRenderer1.geometry = new SphereGeometry(1.6, 32, 32);
// sphereRenderer1.setMaterial(mtl);

const w = 2;
let obj2 = rootNode.createChild("obj2");
obj2.position = [-2, -2, 0];
obj2.setRotationAngles(0, 30, 0);
let cubeRenderer2 = obj2.createAbility(AGeometryRenderer);
cubeRenderer2.geometry = new CuboidGeometry(w, w, w);
cubeRenderer2.setMaterial(mtl);

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(StandardCamera, {
  canvas: "o3-demo",
  clearParam: [0.5, 0, 0, 1],
  position: [0, 0, 10],
  near: 0.1,
  far: 100
});
cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });

//-- run
engine.run();
