'use strict';

import { Engine } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import '@alipay/r3-engine-stats';

import ARotation from '../common/ARotation';

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 10, 20]
});

//-- run
engine.run();

//-- 测试键
document.addEventListener('keydown', (event) => {

  // 测试键：Ctrl+C ，结束运行
  if (event.ctrlKey && event.key === 'c') {
    if (engine) {
      console.log('ENGINE SHUTDOWN');
      engine.shutdown();
      engine = null;
    }
  }

  // 测试键：Ctrl+P ，暂停
  if (event.ctrlKey && event.key === 'p') {
    if (engine) {
      console.log('ENGINE pause');
      engine.pause();
    }
  }

  // 测试键：Ctrl+R ，继续
  if (event.ctrlKey && event.key === 'r') {
    if (engine) {
      console.log('ENGINE resume');
      engine.resume();
    }
  }


}, false);
