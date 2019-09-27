import { Engine } from '@alipay/o3-core';
import { AGPUParticleSystem } from '@alipay/o3-particle';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { Resource, ResourceLoader } from '@alipay/o3-loader';
import { AOrbitControls } from '@alipay/o3-orbit-controls'

import { TextureWrapMode } from '@alipay/o3-base';
import '@alipay/o3-engine-stats';

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const canvas = document.getElementById('o3-demo');
const cameraNode = rootNode.createChild('camera_node');
cameraNode.createAbility(ADefaultCamera, {
  canvas: canvas, position: [0, 0, 30], target: [0, 0, 0]
});

let controler = cameraNode.createAbility(AOrbitControls);
controler.minDistance = 4;
controler.maxDistance = 50;

const spriteSheet = [
  { "x": 0, "y": 0, "w": 100, "h": 95, "offX": 0, "offY": 0, "sourceW": 100, "sourceH": 95 },
  { "x": 100, "y": 0, "w": 48, "h": 46, "offX": 0, "offY": 0, "sourceW": 48, "sourceH": 46 },
  { "x": 148, "y": 0, "w": 97, "h": 90, "offX": 0, "offY": 0, "sourceW": 97, "sourceH": 90 },
  { "x": 245, "y": 0, "w": 148, "h": 128, "offX": 0, "offY": 0, "sourceW": 148, "sourceH": 128 },
  { "x": 393, "y": 0, "w": 118, "h": 249, "offX": 0, "offY": 0, "sourceW": 118, "sourceH": 249 },
  { "x": 100, "y": 90, "w": 124, "h": 94, "offX": 0, "offY": 0, "sourceW": 124, "sourceH": 94 },
  { "x": 0, "y": 184, "w": 249, "h": 185, "offX": 0, "offY": 0, "sourceW": 249, "sourceH": 185 },
  { "x": 0, "y": 95, "w": 86, "h": 83, "offX": 0, "offY": 0, "sourceW": 86, "sourceH": 83 }
]

// 创建节点
const node = rootNode.createChild("particle");
node.position = [2, 5, 0];
// 给节点绑定粒子发射器组件
const particleComp1 = node.createAbility(AGPUParticleSystem);
// 粒子发射参数
const options = {
  // position: [0, 2.5, 0],
  // positionRandomness: [5, 0, 0],
  // velocity: [0, -0.1, 0],
  // velocityRandomness: [0.1, 0.1, 0.1],
  // acceleration: [0, -0.02, 0],
  // accelerationRandomness: [0.03, 0.01, 0.03],
  // color: 0xe2c0cd,
  // colorRandomness: 0.1,
  // lifetime: 10,
  // size: 1,
  // sizeRandomness: 0.1,
  // startAngle: 0,
  // startAngleRandomness: 1,
  // rotateRate: 0,
  // rotateRateRandomness: 2,
  // acceleration: [0, -0.05, 0]

  accelerationRandomness: [0, 2, 0],
  alpha: 1,
  alphaRandomness: 0,
  color: [1, 1, 1],
  defaultStart: true,
  dst: "ONE_MINUS_SRC_ALPHA",
  dstAlpha: "ONE_MINUS_SRC_ALPHA",
  dstRGB: "ONE_MINUS_SRC_ALPHA",
  fadeIn: false,
  intervalFrameCount: 0,
  isScaleByLifetime: false,
  lifetime: 4,
  maskTexture: null,
  position: [0, 1, 0],
  positionRandomness: [0, 0, 0],
  rotateRate: 3,
  rotateRateRandomness: 2,
  scaleFactor: 1,
  separate: false,
  size: 1,
  sizeRandomness: 0,
  src: "SRC_ALPHA",
  srcAlpha: "SRC_ALPHA",
  srcRGB: "SRC_ALPHA",
  startAngle: 0,
  startAngleRandomness: 0,
  texture: { type: "asset", id: "8", dirId: "", dirName: "" },
  useOriginColor: true,
  velocity: [0, 0, 0],
  velocityRandomness: [0.5, 0.5, 0.5],
};
// 粒子发射器环境参数
const config = {
  // once: true,
  maxCount: 1000,
  spawnCount: 0.2,
  spriteSheet,
  // is2d: false,
  options: options
};

const resourceLoader = new ResourceLoader();

const img = 'https://gw-office.alipayobjects.com/basement_prod/f474fffc-f76c-4a95-80b4-ba42170f3fe9.png'

// 资源定义
let textureRes = [];
textureRes.push(new Resource('particleTex', {
  type: 'texture',
  url: img
}));
// 资源加载
resourceLoader.batchLoad(textureRes, (err, res) => {
  if (!err) {
    const texture1 = res[0].asset;

    // 粒子发射器初始化
    particleComp1.initialize({ ...{ texture: texture1 }, ...config });
    // 开始发射粒子
    particleComp1.start();
    // 启动引擎
    engine.run();
  }
});
