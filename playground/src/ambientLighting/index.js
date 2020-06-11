import { vec4 } from '@alipay/o3-math';
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { SphereGeometry, CuboidGeometry } from '@alipay/o3-geometry-shape';
import { ResourceLoader } from '@alipay/o3-loader';
import { AAmbientLight } from '@alipay/o3-lighting';
import { ConstantMaterial } from '@alipay/o3-mobile-material';
import '@alipay/o3-engine-stats';

import ALightColor from '../common/ALightColor';

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);
let scene = engine.currentScene;
let rootNode = scene.root;

//-- create light
let light = rootNode.createChild("light1");
light.createAbility(AAmbientLight);
light.createAbility(ALightColor, AAmbientLight);

//-- create geometry objects
let mtl = new ConstantMaterial('test_mtl1', false);
mtl.ambient = vec4.fromValues(0.75, 0.25, 0.25, 1);

let obj1 = rootNode.createChild("obj1");
obj1.position = [0, -1, 0];
let sphereRenderer1 = obj1.createAbility(AGeometryRenderer);
sphereRenderer1.geometry = new SphereGeometry(1.6, 32, 32);
sphereRenderer1.setMaterial(mtl);

const w = 2;
let obj2 = rootNode.createChild("obj2");
obj2.position = [0, 3, 0];
obj2.setRotationAngles(30, -35, 0);
let cubeRenderer2 = obj2.createAbility(AGeometryRenderer);
cubeRenderer2.geometry = new CuboidGeometry(w, w, w);
cubeRenderer2.setMaterial(mtl);

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 5, 17], near: 0.1, far: 100
});
console.log(cameraNode.transform.worldMatrix);

//-- run
engine.run();

