import { Engine } from '@alipay/r3-core';
import { ClearMode, BlendFunc, Logger } from '@alipay/r3-base';
import { GLRenderHardware } from '@alipay/r3-rhi-webgl';
import { BasicSceneRenderer } from '@alipay/r3-renderer-basic';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { AGPUParticleSystem } from '@alipay/r3-particle';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { Resource, ResourceLoader } from '@alipay/r3-loader';

import { vec3 } from '@alipay/r3-math';
import '@alipay/r3-engine-stats';

Logger.enable();

let type = 'circle';
function getPosition(tick){
  let theta = tick;
  let r;
  let a;
  let b;
  let x = 0;
  let y = 0;
  switch (type) {
    case 'love':
      r = 2 * Math.acos(Math.sin(theta));
      y = 4;
      break;
    case 'spiral':
      a = 0.2;
      b = 0.2;
      theta = theta % 30;
      r = a + b * theta;
      break;
    case 'flower':
      a = 4;
      b = 4;
      theta *= 2;
      r = a * Math.sin(b * theta);
      break;
    default:
      r = 3;
      break;
  }
  x += r * Math.cos(theta);
  y += r * Math.sin(theta);
  return [x, y, 3];
};
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

let obj = rootNode.createChild("particle");

let particleComp = obj.createAbility(AGPUParticleSystem);

let options = {
  positionRandomness: [0, 0, 0],
  velocity: [0, 0, 0],
  velocityRandomness: [0.1, 0.1, 0.1],
  acceleration: [0, -0.1, 0],
  accelerationRandomness: [0.1, 0.1, 0.1],
  color: 0xFFE700,
  colorRandomness: 0.5,
  lifetime: 3,
  size:60,
  sizeRandomness: 0,
};
const config = {
  maxCount: 10000,
  spawnCount: 10,
  rotateToVelocity: true,
  useOriginColor:false,
  getOptions: function(tick) {
    const position = getPosition(tick);
    if (position) {
      options.position = position;
    }
    return options;
  }
};
// const resourceLoader = new ResourceLoader();
// const img = 'https://gw.alipayobjects.com/zos/rmsportal/ugOSEmevXFyotvYxymVX.png';
// const maskImg = 'https://gw.alipayobjects.com/zos/rmsportal/mnwKdcMXMRqFFulOeUck.png';
// let textureRes = [];
// textureRes.push(new Resource('particleTex', {
//   type: 'texture',
//   url: img,
// }));
// textureRes.push(new Resource('particleMaskTex', {
//   type: 'texture',
//   url: maskImg,
// }));
// resourceLoader.batchLoad(textureRes, (err, res)=>{
//   if(!err) {
//     config.texture = res[0].asset;
//     if(res.length > 1){
//       config.maskTexture = res[1].asset;
//     }
    particleComp.initialize(config);
    particleComp.start();
//   }
// });

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 20],
  far: 100,
  near: 1
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
document.getElementById('line').onchange = function(event) {
  type = this.selectedOptions[0].value;
  particleComp.restart();
};

