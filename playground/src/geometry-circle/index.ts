import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { CircleGeometry } from "@alipay/o3-geometry-shape";
import "@alipay/o3-engine-stats";
import { ResourceLoader } from "@alipay/o3-loader";

import createShapeMaterial from "../cubiodGeometry/GeometryShapeMaterial";
import ARotation from "../common/ARotation";
import { DrawMode } from "@alipay/o3-base";

let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

function createSphereGeometry(name, position, radius, segments, thetaStart, thetaLength) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  let renderer = obj.createAbility(AGeometryRenderer);
  renderer.geometry = new CircleGeometry({
    radius,
    segments,
    thetaStart,
    thetaLength
  });
  renderer.geometry.mode = DrawMode.TRIANGLES;
  renderer.setMaterial(createShapeMaterial(resourceLoader));
}

createSphereGeometry("obj1", [-5, 4, 0], 1.6, 8);
createSphereGeometry("obj2", [0, 4, 0], 1.6, 3);
createSphereGeometry("obj3", [5, 4, 0], 1.6, 20);
createSphereGeometry("obj4", [-5, -2, 0], 1.6, 36, Math.PI / 2, Math.PI / 3);
createSphereGeometry("obj5", [0, -2, 0], 1.6, 36, Math.PI * 2, (4 * Math.PI) / 6);
createSphereGeometry("obj6", [5, -2, 0], 1.6, 36, 0, Math.PI / 2);

let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 20]
});
cameraNode.createAbility(AOrbitControls);

//-- run
engine.run();
