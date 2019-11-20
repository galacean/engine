import { Engine } from "@alipay/o3-core";
import { Logger } from "@alipay/o3-base";
import { AGPUParticleSystem } from "@alipay/o3-particle";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { Resource, ResourceLoader } from "@alipay/o3-loader";
import { AOrbitControls } from "@alipay/o3-orbit-controls";

Logger.enable();
// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const canvas = document.getElementById("o3-demo");
const cameraNode = rootNode.createChild("camera_node");
cameraNode.createAbility(ADefaultCamera, {
  canvas: canvas,
  position: [0, 0, 10],
  target: [0, 0, 0]
});
let controler = cameraNode.createAbility(AOrbitControls);
controler.minDistance = 4;
controler.maxDistance = 50;

// 创建节点
const node = rootNode.createChild("particle");
// 给节点绑定粒子发射器组件
const particleComp1 = node.createAbility(AGPUParticleSystem);
// 粒子发射参数
const options = {
  maxCount: 1,
  fadeIn: false,
  fadeOut: true,
  positionRandomness: [5, 5, 0],
  startTimeRandomness: 4,
  color: 0xe2c0cd,
  colorRandomness: 0.1,
  lifetime: 2,
  size: 0.2,
  sizeRandomness: 0.1,
  startAngle: 0,
  startAngleRandomness: 1,
  rotateRate: 0,
  rotateRateRandomness: 2
};

const resourceLoader = new ResourceLoader();
const img1 = "https://gw.alipayobjects.com/zos/rmsportal/TrjMPPscVKLspdZmddHK.png";
// 资源定义
let textureRes = [];
textureRes.push(
  new Resource("particleTex", {
    type: "texture",
    url: img1
  })
);
// 资源加载
resourceLoader.batchLoad(textureRes, (err, res) => {
  if (!err) {
    const texture1 = res[0].asset;

    // 粒子发射器初始化
    particleComp1.initialize({ ...{ texture: texture1 }, ...options });
    // 开始发射粒子
    particleComp1.start();
    // 启动引擎
    engine.run();
  }
});
