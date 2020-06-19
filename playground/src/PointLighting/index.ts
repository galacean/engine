import { vec3, vec4 } from "@alipay/o3-math";
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { SphereGeometry, CuboidGeometry } from "@alipay/o3-geometry-shape";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { ResourceLoader } from "@alipay/o3-loader";
import "@alipay/o3-engine-stats";

import { APointLight } from "@alipay/o3-lighting";
import { ConstantMaterial, BlinnPhongMaterial } from "@alipay/o3-mobile-material";

import AMove from "../common/AMove";

let mtl = new BlinnPhongMaterial("TestMaterial");
mtl.diffuse = vec4.fromValues(0.85, 0.25, 0.25, 1);
mtl.ambient = vec4.fromValues(0.25, 0.25, 0.25, 1);
mtl.shininess = 10;

function createSphereGeometry(name, position, r, h, v) {
  let obj = rootNode.createChild(name);
  obj.position = position;

  let sphereRenderer = obj.createAbility(AGeometryRenderer);
  sphereRenderer.geometry = new SphereGeometry(r, h, v);
  sphereRenderer.setMaterial(mtl);
}

function createCuboidGeometry(name, position, rotation, w) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);

  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, w, w);
  cubeRenderer.setMaterial(mtl);
}

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create light
let light1 = rootNode.createChild("light1");
light1.createAbility(APointLight, {
  color: vec3.fromValues(0.5, 0.2, 0.8),
  intensity: 1.0,
  position: vec3.fromValues(0, 4, 10),
  distance: 10,
  decay: 0
});
light1.createAbility(AMove);

let lgtMtl = new ConstantMaterial("test_mtl1");
lgtMtl.emission = vec4.fromValues(0.85, 0.85, 0.85, 1);

let cubeRenderer3 = light1.createAbility(AGeometryRenderer);
cubeRenderer3.geometry = new SphereGeometry(0.12);
cubeRenderer3.setMaterial(lgtMtl);

//-- create sphere
let i;
let positionRange = 10;
let rotationnRange = 90;
for (i = 0; i < 30; i++) {
  let position = [
    (Math.random() - 0.5) * positionRange,
    (Math.random() - 0.5) * positionRange,
    (Math.random() - 0.5) * positionRange
  ];
  let r = Math.random() / 2 + 0.2;

  createSphereGeometry("sphere" + i, position, r, Math.ceil(r * 20), Math.ceil(r * 20));
}

//-- create cub
for (i = 0; i < 30; i++) {
  let position = [
    (Math.random() - 0.5) * positionRange,
    (Math.random() - 0.5) * positionRange,
    (Math.random() - 0.5) * positionRange
  ];
  let rotation = [
    (Math.random() - 0.5) * rotationnRange,
    (Math.random() - 0.5) * rotationnRange,
    (Math.random() - 0.5) * rotationnRange
  ];
  let w = Math.random() / 2 + 0.2;

  createCuboidGeometry("cube" + i, position, rotation, w);
}

//-- create camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 5, 17],
  near: 0.1,
  far: 100
});

//-- run
engine.run();
