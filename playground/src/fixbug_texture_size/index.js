
import { Engine } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { CuboidGeometry } from '@alipay/r3-geometry-shape';
import '@alipay/r3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import { ConstantMaterial } from '@alipay/r3-mobile-material';

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

let textureRes = new Resource('text', {
  type: 'texture',
  url: './u2p.png',
  reSample: false,
});

function createCuboidGeometry(name, position,rotation, w, h, d, mtl) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, h, d);
  cubeRenderer.setMaterial(mtl);
}

resourceLoader.batchLoad([textureRes], (err, res) => {

  let mtl = new ConstantMaterial('tex1', false);
  mtl.emission = res[0].assets[0];

  const w = 2;
  const h = 3;
  const d = 4;
  createCuboidGeometry('obj1', [0, 2, 0],[0, 0, 0], w, w, w, mtl);
  createCuboidGeometry('obj2', [4, 2, 0],[0, 0, 0], w, h, d, mtl);
  createCuboidGeometry('obj3', [-3, -3, 0],[0, 0, 0], w, w, d, mtl);
  createCuboidGeometry('obj4', [3, -3, 0],[0, 0, 0], d, w, d, mtl);
  createCuboidGeometry('obj5', [-4, 2, 0],[0, 0, 0], d, w, w, mtl);

});

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 10, 20]
});

engine.run();

