
import { Logger, TextureFilter } from '@alipay/r3-base';
import { Engine } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import '@alipay/r3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import { AOrbitControls } from '@alipay/r3-orbit-controls';
import { TextureCubeMap } from '@alipay/r3-material';
import { ASkyBox } from '@alipay/r3-skybox';

Logger.enable();

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

let cubeMapRes = new Resource('env', {
  type: 'cubemap',
  urls: [
    './environment/px.jpg',
    './environment/nx.jpg',
    './environment/py.jpg',
    './environment/ny.jpg',
    './environment/pz.jpg',
    './environment/nz.jpg',
  ]
});

let cubeMapRes2 = new Resource('env', {
  type: 'cubemap',
  urls: [
    './papermill/px.jpg',
    './papermill/nx.jpg',
    './papermill/py.jpg',
    './papermill/ny.jpg',
    './papermill/pz.jpg',
    './papermill/nz.jpg',
  ]
});

resourceLoader.batchLoad([cubeMapRes, cubeMapRes2], (err, res) => {

  let cubeMaps = res.map(r => r.assets[0]);
  let skybox = rootNode.createAbility(ASkyBox, { skyBoxMap: cubeMaps[0] });
  let pointer = 1;
  setInterval(()=> {
    skybox.skyBoxMap = cubeMaps[pointer++ % 2];
  },2000);

});

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 3]
});
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo')});

engine.run();
