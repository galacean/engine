import { Engine } from '@alipay/r3-core';
import { AGPUParticleSystem } from '@alipay/r3-particle';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { Resource, ResourceLoader } from '@alipay/r3-loader';

import { TextureWrapMode } from '@alipay/r3-base';
// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const canvas = document.getElementById('mountNode');
const cameraNode = rootNode.createChild('camera_node');
cameraNode.createAbility(ADefaultCamera, {
  canvas: canvas, position: [0, 0, 5], target: [0, 0, 0]
});

// 创建节点
const node = rootNode.createChild("particle");
// 给节点绑定粒子发射器组件
const particleComp1 = node.createAbility(AGPUParticleSystem);
const particleComp2 = node.createAbility(AGPUParticleSystem);
const particleComp3 = node.createAbility(AGPUParticleSystem);
// 粒子发射参数
const options = {
  position: [0, 2.5, 0],
  positionRandomness: [5, 0, 0],
  velocity: [0, -0.1, 0],
  velocityRandomness: [0.1, 0.1, 0.1],
  acceleration: [0, -0.02, 0],
  accelerationRandomness: [0.03, 0.01, 0.03],
  color: 0xe2c0cd,
  colorRandomness: 0.1,
  lifetime: 10,
  size: 300,
  sizeRandomness: 0.5,
  startAngle: 0,
  startAngleRandomness: 1,
  rotateRate: 0,
  rotateRateRandomness: 2,
};
// 粒子发射器环境参数
const config = {
  maxCount: 1000,
  spawnCount: 0.2,
  options: options
};

const resourceLoader = new ResourceLoader();
const img1 = 'https://gw.alipayobjects.com/zos/rmsportal/TrjMPPscVKLspdZmddHK.png';
const img2 = 'https://gw.alipayobjects.com/zos/rmsportal/YhIJlRzGyxhbrRStilfM.png';
const img3 = 'https://gw.alipayobjects.com/zos/rmsportal/aowainSRGDQRaaiCrfZP.png';
// 资源定义
let textureRes = [];
textureRes.push(new Resource('particleTex', {
  type: 'texture',
  url: img1
}));
textureRes.push(new Resource('particleTex', {
  type: 'texture',
  url: img2
}));
textureRes.push(new Resource('particleTex', {
  type: 'texture',
  url: img3
}));
// 资源加载
resourceLoader.batchLoad(textureRes, (err, res)=>{
  if(!err) {
    const texture1 = res[0].asset;
    const texture2 = res[1].asset;
    const texture3 = res[2].asset;

    // 粒子发射器初始化
    particleComp1.initialize({...{texture: texture1}, ...config});
    particleComp2.initialize({...{texture: texture2}, ...config});
    particleComp3.initialize({...{texture: texture3}, ...config});
    // 开始发射粒子
    particleComp1.start();
    particleComp2.start();
    particleComp3.start();
    // 启动引擎
    engine.run();
  }
});
