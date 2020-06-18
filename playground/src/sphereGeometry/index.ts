import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { SphereGeometry } from '@alipay/o3-geometry-shape';
import '@alipay/o3-engine-stats';
import { ResourceLoader } from '@alipay/o3-loader';

import createShapeMaterial from '../cubiodGeometry/GeometryShapeMaterial';
import ARotation from '../common/ARotation';

let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

function createSphereGeometry(name, position, r, h, v, as, ae, ts, te) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  let sphereRenderer = obj.createAbility(AGeometryRenderer);
  sphereRenderer.geometry = new SphereGeometry(r, h, v, as, ae, ts, te);
  sphereRenderer.setMaterial(createShapeMaterial(resourceLoader));
  obj.createAbility(ARotation);
}

createSphereGeometry('obj1', [-2, 4, 0], 1.6, 8, 6);
createSphereGeometry('obj2', [2.5, 4, 0], 1.6, 3, 2);
createSphereGeometry('obj3', [2.5, -5.5, 0], 1.8, 18, 16);
createSphereGeometry('obj4', [-2.5, 0, 0], 2, 18, 16, 0, Math.PI / 2, Math.PI /3, Math.PI /3);
createSphereGeometry('obj5', [2.5, 1, 0], 2, 4, 2, 0, Math.PI * 2, 4*Math.PI / 6, Math.PI / 6);
createSphereGeometry('obj6', [-2.5, -5.5, 0], 1.8, 12, 8, 0, Math.PI * 2,0, Math.PI / 2);

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 10, 20]
});

//-- run
engine.run();

