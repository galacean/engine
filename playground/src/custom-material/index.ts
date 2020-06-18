import { vec3, vec4 } from '@alipay/o3-math';
import { Logger, ClearMode } from '@alipay/o3-base';
import { Engine } from '@alipay/o3-core';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { SphereGeometry, CuboidGeometry } from '@alipay/o3-geometry-shape';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { AAmbientLight, ADirectLight } from '@alipay/o3-lighting';
import { HatchingMaterial } from './HatchingMaterial';
import { AOrbitControls } from '@alipay/o3-orbit-controls';


Logger.enable();
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, -10], target: [0, 0, 0],
});
camera.setClearMode(ClearMode.SOLID_COLOR, [1, 1, 1, 1]);

let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById('o3-demo') });
controler.autoRotate = false;
controler.minDistance = 4;
controler.maxDistance = 50;

//-- create lights
let light2 = rootNode.createChild('light2');
let dirLgt = light2.createAbility(ADirectLight, {
  color: vec3.fromValues(1, 1, 1),
  intensity: 0.8,
});
light2.position = [-10, 20, -15];
light2.lookAt([0, 0, 0], [0, 1, 0]);

let resourceLoader = new ResourceLoader(engine);

let textureRes = [];
textureRes.push(
  new Resource('hatch0', {
    type: 'texture',
    url: '/static/texture/custom-material/hatch_0.jpg',
  }),
  new Resource('hatch1', {
    type: 'texture',
    url: '/static/texture/custom-material/hatch_1.jpg',
  }),
  new Resource('hatch2', {
    type: 'texture',
    url: '/static/texture/custom-material/hatch_2.jpg',
  }),
  new Resource('hatch3', {
    type: 'texture',
    url: '/static/texture/custom-material/hatch_3.jpg',
  }),
  new Resource('hatch4', {
    type: 'texture',
    url: '/static/texture/custom-material/hatch_4.jpg',
  }),
  new Resource('hatch5', {
    type: 'texture',
    url: '/static/texture/custom-material/hatch_5.jpg',
  }),
);
resourceLoader.batchLoad(textureRes, (err, res) => {

  //-- create sphere
  let mtl1 = new HatchingMaterial('hatching', dirLgt);
  mtl1.texHatch0 = res[0].assets[0];
  mtl1.texHatch1 = res[1].assets[0];
  mtl1.texHatch2 = res[2].assets[0];
  mtl1.texHatch3 = res[3].assets[0];
  mtl1.texHatch4 = res[4].assets[0];
  mtl1.texHatch5 = res[5].assets[0];
  mtl1.titling = 1.6;

  let sphereNode = rootNode.createChild('TestSphere');
  sphereNode.position = [0, 1, 0];

  let sphereRenderer = sphereNode.createAbility(AGeometryRenderer);
  sphereRenderer.geometry = new SphereGeometry(1.0, 64, 64);
  sphereRenderer.setMaterial(mtl1);

  //-- create box
  let mtl2 = new HatchingMaterial('hatching', dirLgt);
  mtl2.texHatch0 = res[0].assets[0];
  mtl2.texHatch1 = res[1].assets[0];
  mtl2.texHatch2 = res[2].assets[0];
  mtl2.texHatch3 = res[3].assets[0];
  mtl2.texHatch4 = res[4].assets[0];
  mtl2.texHatch5 = res[5].assets[0];
  mtl2.titling = 0.8;

  let cubeSize = 2.0;
  let boxNode = rootNode.createChild('BoxNode');
  boxNode.position = [0, -1, 0];

  let boxRenderer = boxNode.createAbility(AGeometryRenderer);
  boxRenderer.geometry = new CuboidGeometry(cubeSize, cubeSize, cubeSize);
  boxRenderer.setMaterial(mtl2);
});

//-- run
engine.run();
