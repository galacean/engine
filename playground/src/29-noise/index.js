import { Logger } from '@alipay/r3-base';
import { Engine  } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { SphereGeometry } from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';

import { NoiseMaterial } from './NoiseMaterial';
import ARotation from '../common/ARotation';

Logger.enable();

let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

function createSphereGeometry(name, position, r, h, v, as, ae, ts, te) {

  let obj = rootNode.createChild(name);
  obj.position = position;

  let sphereRenderer = obj.createAbility(AGeometryRenderer);
  sphereRenderer.geometry = new SphereGeometry(r, h, v, as, ae, ts, te);

  let material = new NoiseMaterial('noise');
  sphereRenderer.setMaterial(material);
  obj.createAbility(ARotation);
}

createSphereGeometry('obj1', [0, 0, 0], 4, 50, 50);

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 5, 17], target: [0, 0, 0]
});

//-- run
engine.run();

