
import { Logger } from '@alipay/o3-base';
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { CuboidGeometry } from '@alipay/o3-geometry-shape';
import '@alipay/o3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { AOrbitControls } from '@alipay/o3-orbit-controls';

import ASwitchTexture from './ASwitchTexture';
import createCubeMaterial from './geometryMaterial';

Logger.enable();

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

let textureRes = new Resource('text0', {
  type: 'texture',
  url: './17674-testtexture.png',
});

let textureRes1 = new Resource('text', {
  type: 'texture',
  url: './linear.jpeg',
});

let textureRes2 = new Resource('text1', {
  type: 'texture',
  url: './testTexture.jpg',
});

function createCuboidGeometry(name, position,rotation, w, h, d, mtl) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, h, d);
  cubeRenderer.setMaterial(mtl);
}

resourceLoader.batchLoad([textureRes, textureRes1, textureRes2], (err, res) => {

  // let mtl = new ConstantMaterial('tex1', false);
  // mtl.emission = res[0].assets[0];

  let texs = [res[1].assets[0], res[2].assets[0]];
  let mtl = createCubeMaterial(resourceLoader);
  mtl.setValue('u_t1', res[0].assets[0]);
  mtl.setValue('u_t2', res[1].assets[0]);

  const w = 2;
  const h = 3;
  const d = 4;
  createCuboidGeometry('obj1', [0, 0, 0],[0, 0, 0], w, w, w, mtl);

  // let idx = 1;
  // setInterval(() => {
  //   mtl.setValue('u_t2', texs[idx%2]);
  //   idx ++;
  // }, 2000);

  rootNode.createAbility(ASwitchTexture, {mtl, time: 1000, uniformName: 'u_t2', textures: texs })

});

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 10]
});
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('o3-demo')});

engine.run();

