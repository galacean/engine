import { vec3, vec4 } from '@alipay/o3-math';
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { SphereGeometry, CuboidGeometry } from '@alipay/o3-geometry-shape';
import { ResourceLoader } from '@alipay/o3-loader';
import '@alipay/o3-engine-stats';

import { ConstantMaterial, BlinnPhongMaterial } from '@alipay/o3-mobile-material';
import { ASpotLight } from '@alipay/o3-lighting';

import ARotation from '../common/ARotation';
import ALightColor from '../common/ALightColor';
import AMove from '../common/AMove';

let mtl = new BlinnPhongMaterial('TestMaterial', false);
mtl.diffuse = vec4.fromValues(0.1, 0.9, 0.8, 1);
mtl.shininess = 10;

function createCuboidGeometry(name, position,rotation, w, h, d) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = new CuboidGeometry(w, h, d);
  cubeRenderer.setMaterial(mtl);
}

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create light
let lighthouse = rootNode.createChild("lighthouse");
lighthouse.createAbility(ARotation);
let light1 = lighthouse.createChild("light1");
light1.createAbility(ASpotLight, {
  color: vec3.fromValues(1, 1, 1),
  intensity: 1.0,
  distance: 80,
  decay: 0,
  angle: Math.PI / 12,
  penumbra: 0.2
});
light1.createAbility(AMove, {range:1, y:2});
light1.setRotationAngles(50, 0, 0);
// light1.createAbility(ALightColor, ASpotLight);

let lgtMtl = new ConstantMaterial('test_mtl1', false);
lgtMtl.emission = vec4.fromValues(0.85, 0.85, 0.85, 1);

let sphereRenderer3 = light1.createAbility(AGeometryRenderer);
sphereRenderer3.geometry = new SphereGeometry(0.1);
sphereRenderer3.setMaterial(lgtMtl);

//-- create geometry
createCuboidGeometry('cubiod1', [0, -3, 0],[0, 0, 0],10, 0.1, 10);
createCuboidGeometry('cubiod2', [5, -2, 0],[0, 0, 0],0.1, 2, 10);
createCuboidGeometry('cubiod3', [-5, -2, 0],[0, 0, 0],0.1, 2, 10);
createCuboidGeometry('cubiod4', [0, -2, -5],[0, 0, 0],10, 2, 0.1);

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 5, 17], near: 0.1, far: 100
});

//-- run
engine.run();

//-- 测试键：Ctrl+C ，结束运行
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'c') {
    if (engine) {
      console.log('ENGINE SHUTDOWN');
      engine.shutdown();
      engine = null;
    }
  }
}, false);
