import { Engine } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import '@alipay/r3-engine-stats';

import createCubeGeometry from './cube';
import ARotation from '../common/ARotation';
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
cubeRenderer.geometry = createCubeGeometry(size);
cubeRenderer.setMaterial(createCubeMaterial(resourceLoader));

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 10, 20]
});

obj.createAbility(ARotation);

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
