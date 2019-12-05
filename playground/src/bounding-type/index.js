import { Engine } from "@alipay/o3-core";
import { DrawMode } from "@alipay/o3-base";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { BlinnPhongMaterial, ConstantMaterial } from "@alipay/o3-mobile-material";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { CuboidGeometry, SphereGeometry } from "@alipay/o3-geometry-shape";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { ASpotLight } from "@alipay/o3-lighting";
import { AABB, OBB, BoundingSphere } from "@alipay/o3-bounding-info";
import * as dat from "dat.gui";
import { vec3 } from "@alipay/o3-math";
import { createCubeGeometry } from "./geometry";
const gui = new dat.GUI();

let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

// camera
let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo"
});
let controler = cameraNode.createAbility(AOrbitControls);

// obj
let obj = rootNode.createChild("obj");
let renderer = obj.createAbility(AGeometryRenderer);
renderer.geometry = new CuboidGeometry(2, 2, 2);
renderer.material = new BlinnPhongMaterial("mat");

// light
let lightNode = rootNode.createChild("light_node");
lightNode.position = [5, 5, 5];
lightNode.lookAt([0, 0, 0], [0, 1, 0]);
let light = lightNode.createAbility(ASpotLight, {
  color: vec3.fromValues(1, 0, 0),
  intensity: 1.0,
  distance: 100,
  decay: 0,
  angle: Math.PI / 3,
  penumbra: 0.2
});

//boundingInfo
let boundingBox = new AABB();
let orientedBoundingBox = new OBB();
let boundingSphere = new BoundingSphere();
let boundingNode = null;
function createBoundingSphere() {
  boundingSphere.setFromGeometryRenderer(renderer);
  let { centerWorld, radiusWorld } = boundingSphere;
  let obj = rootNode.createChild("boundingSphere");
  obj.position = centerWorld;
  if (boundingNode) boundingNode.destroy();
  boundingNode = obj;
  let r = obj.createAbility(AGeometryRenderer);
  r.geometry = new SphereGeometry(radiusWorld, 16, 16);
  r.material = new ConstantMaterial("mat");
  r.material.emission = [1, 1, 0, 1];
  r.geometry.primitive.mode = DrawMode.LINE_STRIP;
}
function createBoundingBox() {
  boundingBox.setFromGeometryRenderer(renderer);
  let { min, max } = boundingBox;
  let sub = vec3.subtract(vec3.create(), max, min);
  let center = vec3.add(vec3.create(), min, max);
  vec3.scale(center, center, 0.5);
  let obj = rootNode.createChild("bouningBox");
  obj.position = center;
  if (boundingNode) boundingNode.destroy();
  boundingNode = obj;
  let r = obj.createAbility(AGeometryRenderer);
  r.geometry = new CuboidGeometry(sub[0], sub[1], sub[2]);
  r.geometry.primitive.mode = DrawMode.LINE_STRIP;

  r.material = new ConstantMaterial("mat");
  r.material.emission = [1, 1, 0, 1];
}
function createOBB() {
  orientedBoundingBox.setFromGeometryRenderer(renderer);
  let { cornersWorld } = orientedBoundingBox;
  let obj = rootNode.createChild("obb");
  if (boundingNode) boundingNode.destroy();
  boundingNode = obj;
  let r = obj.createAbility(AGeometryRenderer);
  r.geometry = createCubeGeometry(cornersWorld);
  r.material = new ConstantMaterial("mat");
  r.material.emission = [1, 1, 0, 1];
  r.geometry.primitive.mode = DrawMode.LINE_STRIP;
}
createBoundingSphere();

// gui
let state = {
  color: [1, 1, 0],
  type: "sphere",
  px: obj.position[0],
  py: obj.position[1],
  pz: obj.position[2],
  scaleX: obj.scale[0],
  scaleY: obj.scale[1],
  scaleZ: obj.scale[2],
  rotateX: obj.transform.rotation.x,
  rotateY: obj.transform.rotation.y,
  rotateZ: obj.transform.rotation.z
};

function showBounding() {
  switch (state.type) {
    case "sphere":
      createBoundingSphere();
      break;
    case "AABB":
      createBoundingBox();
      break;
    case "OBB":
      createOBB();
      break;
  }
}

gui
  .add(state, "type", ["sphere", "AABB", "OBB"])
  .onChange(() => {
    showBounding();
  })
  .name("包围盒类型");
gui.add(state, "px", -5, 5).onChange(val => {
  obj.position = [val, obj.position[1], obj.position[2]];
  showBounding();
});
gui.add(state, "py", -5, 5).onChange(val => {
  obj.position = [obj.position[0], val, obj.position[2]];
  showBounding();
});
gui.add(state, "pz", -5, 5).onChange(val => {
  obj.position = [obj.position[0], obj.position[1], val];
  showBounding();
});
gui.add(state, "scaleX", 0, 5).onChange(val => {
  obj.scale = [val, obj.scale[1], obj.scale[2]];
  showBounding();
});
gui.add(state, "scaleY", 0, 5).onChange(val => {
  obj.scale = [obj.scale[0], val, obj.scale[2]];
  showBounding();
});
gui.add(state, "scaleZ", 0, 5).onChange(val => {
  obj.scale = [obj.scale[0], obj.scale[1], val];
  showBounding();
});
gui.add(state, "rotateX", -180, 180).onChange(val => {
  obj.transform.rotation.x = val;
  showBounding();
});
gui.add(state, "rotateY", -180, 180).onChange(val => {
  obj.transform.rotation.y = val;
  showBounding();
});
gui.add(state, "rotateZ", -180, 180).onChange(val => {
  obj.transform.rotation.z = val;
  showBounding();
});

//-- run
engine.run();
