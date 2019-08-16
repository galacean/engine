
import { Engine } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { CuboidGeometry } from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';
import { ResourceLoader } from '@alipay/r3-loader';

import createShapeMaterial from './GeometryShapeMaterial';

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

function createCuboidGeometry(name, position,rotation, w, h, d) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, h, d);
  cubeRenderer.setMaterial(createShapeMaterial(resourceLoader));
}


const w = 2;
const h = 3;
const d = 4;
createCuboidGeometry('obj1', [0, 2, 0],[0, 0, 0], w, w, w);
createCuboidGeometry('obj2', [4, 2, 0],[0, 0, 0], w, h, d);
createCuboidGeometry('obj3', [-3, -3, 0],[0, 0, 0], w, w, d);
createCuboidGeometry('obj4', [3, -3, 0],[0, 0, 0], d, w, d);
createCuboidGeometry('obj5', [-4, 2, 0],[0, 0, 0], d, w, w);

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 10, 20]
});

engine.run();

