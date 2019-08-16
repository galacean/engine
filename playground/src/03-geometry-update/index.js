import { Engine } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import '@alipay/r3-engine-stats';

import createCubeGeometry from './cube';
import ARotation from '../common/ARotation';
import AGeometryScale from '../common/AGeometryScale';
import createCubeMaterial from '../common/geometryMaterial';
import { ResourceLoader } from '@alipay/r3-loader';

//-- create engine object
let engine = new Engine();
const resourceLoader = new ResourceLoader(engine);

let scene = engine.currentScene;
let rootNode = scene.root;
const size = 3;
let obj = rootNode.createChild("obj");
let cubeRenderer = obj.createAbility(AGeometryRenderer);
let cubeGeometry = createCubeGeometry(size);
cubeRenderer.geometry = cubeGeometry;
cubeRenderer.setMaterial(createCubeMaterial(resourceLoader));

obj.createAbility(AGeometryScale, {cubeGeometry, size,});

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 10, 20]
});

obj.createAbility(ARotation);

//-- run
engine.run();

