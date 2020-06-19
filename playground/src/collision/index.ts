import { vec3, vec4 } from "@alipay/o3-math";
import { Engine, NodeAbility } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { SphereGeometry, CuboidGeometry } from "@alipay/o3-geometry-shape";
import { ConstantMaterial } from "@alipay/o3-mobile-material";
import { ASphereCollider, ABoxCollider } from "@alipay/o3-collider";
import { ACollisionDetection } from "@alipay/o3-collision";

const COLOR_GRAY = vec4.fromValues(0.75, 0.75, 0.75, 1);
const COLOR_RED = vec4.fromValues(0.95, 0.05, 0.05, 1);

// 控制 node 往复运动
class APingPong extends NodeAbility {
  update(deltaTime) {
    let time = this.engine.time.timeSinceStartup;
    let x = Math.sin(time * 0.001) * 4;
    let pos = this.node.position;
    pos[0] = x;
    this.node.position = pos;
  }
}

//-- create engine
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

// test fixed update
let lastUpdateTime = performance.now();
let n = 0;
scene.addEventListener("fixedUpdate", function(e) {
  n++;
  let nowTime = performance.now();
  let interval = nowTime - lastUpdateTime;
  lastUpdateTime = nowTime;

  console.log(interval);

  if (n > 100) {
    engine.setFixedUpdateInterval(1000);
  }
});

//-- create sphere test node
let sphereMtl = new ConstantMaterial("SphereMtl");
sphereMtl.emission = COLOR_GRAY;

let sphereObj = rootNode.createChild("SphereNode");
sphereObj.position = [-1.5, 0, 0];
sphereObj.createAbility(APingPong);

let radius = 1.25;
let sphereRenderer = sphereObj.createAbility(AGeometryRenderer);
sphereRenderer.geometry = new SphereGeometry(radius, 32, 32);
sphereRenderer.setMaterial(sphereMtl);

let sphereCollider = sphereObj.createAbility(ASphereCollider);
sphereCollider.setSphere([0, 0, 0], radius);

//-- create box test node
let boxMtl = new ConstantMaterial("BoxMtl");
boxMtl.emission = COLOR_RED;

let cubeSize = 2.0;
let boxNode = rootNode.createChild("BoxNode");

let boxRenderer = boxNode.createAbility(AGeometryRenderer);
boxRenderer.geometry = new CuboidGeometry(cubeSize, cubeSize, cubeSize);
boxRenderer.setMaterial(boxMtl);

let boxCollider = boxNode.createAbility(ABoxCollider);
boxCollider.setBoxCenterSize([0, 0, 0], [cubeSize, cubeSize, cubeSize]);

//-- Collision
let cd = sphereObj.createAbility(ACollisionDetection);
sphereObj.addEventListener("begin_overlop", e => {
  sphereMtl.emission = COLOR_RED;
});

sphereObj.addEventListener("end_overlop", e => {
  sphereMtl.emission = COLOR_GRAY;
});

//-- create camera
let cameraNode = rootNode.createChild("CameraNode");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 5, 17],
  target: [0, 0, 0]
});

//-- run
engine.run();
