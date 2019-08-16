import {Logger} from '@alipay/r3-base';
import {Engine} from '@alipay/r3-core';
import {ADefaultCamera} from '@alipay/r3-default-camera';
import {AGeometryRenderer} from '@alipay/r3-geometry';
import {CuboidGeometry} from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';
import {ResourceLoader, Resource} from '@alipay/r3-loader';
import {AOrbitControls} from '@alipay/r3-orbit-controls';
import {TextureCubeMap} from '@alipay/r3-material';

import createCubeMaterial from './geometryMaterial';

Logger.enable();

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

function createCuboidGeometry(name, position, rotation, w, h, d, mtl) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, h, d);
  cubeRenderer.setMaterial(mtl);
}

let cubeMapRes = new Resource('env', {
  type: 'cubemap',
  urls: [
    '/static/env/environment/px.jpg',
    '/static/env/environment/nx.jpg',
    '/static/env/environment/py.jpg',
    '/static/env/environment/ny.jpg',
    '/static/env/environment/pz.jpg',
    '/static/env/environment/nz.jpg',
  ],
});

let cubeMapRes2 = new Resource('env', {
  type: 'cubemap',
  urls: [
    '/static/env/papermill/environment/environment_right_0.jpg',
    '/static/env/papermill/environment/environment_left_0.jpg',
    '/static/env/papermill/environment/environment_top_0.jpg',
    '/static/env/papermill/environment/environment_bottom_0.jpg',
    '/static/env/papermill/environment/environment_front_0.jpg',
    '/static/env/papermill/environment/environment_back_0.jpg',
  ],
});
resourceLoader.batchLoad([cubeMapRes, cubeMapRes2], (err, res) => {

  let cubeMaps = res.map(r => r.assets[0]);
  let images = [cubeMaps[0].images, cubeMaps[1].images];
  let mtl = createCubeMaterial(resourceLoader);
  mtl.setValue('u_cube', cubeMaps[0]);

  const w = 1;
  createCuboidGeometry('obj1', [0, 0, 0], [0, 0, 0], w, w, w, mtl);

  let pointer = 1;
  setInterval(() => {
    cubeMaps[0].images = images[pointer++ % 2];
  }, 2000);

});

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 3]
});
let controler = cameraNode.createAbility(AOrbitControls, {canvas: document.getElementById('r3-demo')});

engine.run();

