
import { Engine } from '@alipay/o3-core';
import { Logger } from '@alipay/o3-base';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { PlaneGeometry } from '@alipay/o3-geometry-shape';
import '@alipay/o3-engine-stats';
import createShapeMaterial from './PlaneMaterial';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import AMove from './AMove';
import { APerspective } from './APerspective';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { AGPUParticleSystem } from '@alipay/o3-particle';

Logger.enable();
//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

function createPlaneGeometry(name, position,rotation, w, h, ws, hs, texture) {
  let obj = rootNode.createChild(name);
  obj.position = position;
  obj.setRotationAngles(rotation[0], rotation[0], rotation[0]);
  let cubeRenderer = obj.createAbility(AGeometryRenderer);
  const geometry = new PlaneGeometry(w, h, ws, hs);
  cubeRenderer.geometry = geometry;
  obj.createAbility(AMove);

  let mtl = createShapeMaterial();
  mtl.setValue('s_diffuse', texture);
  cubeRenderer.setMaterial(mtl);
}

// 创建资源对象，参数分别为对象名，资源类型，资源路径
const res = [];
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/yjjpufYWTytjWyNYtzux.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/yougJQSJnbpgjwbUhNfA.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/OIynnpBxGYOiEwkAsoHn.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/EmCyryahKIKnpAOZNaIS.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/HNLcARjncirYcEixlItq.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/MYZaizEJKenQjgUoRglL.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/iQEiJWbJMzqAkzsagydG.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/zvDOOLuNWHveBpEUpIuT.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/UqQgYGUwnFPCqXiUcUvC.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/ZfwWCEpFMFmhsgeFovty.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/ZlChizJAriqYByFofkxs.png',
} ));
// 资源定义
res.push(new Resource('particleTex', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/cvlLUTxnqEiPXaUUBbUR.png'
}));
const resourceLoader = new ResourceLoader(engine);

const size = 10;
const position = [
[size * 1.5, 0, -10],
[size * 1.5, size, -10],
[size * 1.5, -size, -10],
[0, size, -10],
[-size * 1.5, size, -10],
[0, -size, -10],
[-size * 1.5, -size, -10],
[-size * 1.5, 0, -10],
]

// 创建节点
const node = rootNode.createChild("particle");
// 给节点绑定粒子发射器组件
const particleComp1 = node.createAbility(AGPUParticleSystem);
// 粒子发射参数
const options = {
  position: [0, 0, 0],
  positionRandomness: [0, 0, 0],
  velocity: [0, 0, 0],
  velocityRandomness: [5, 5, 5],
  acceleration: [0, 0, 0],
  accelerationRandomness: [0, 0, 0],
  color: 0xe2c0cd,
  colorRandomness: 0.1,
  lifetime: 10,
  size: 80000,
  sizeRandomness: 0.2,
  startAngle: 0,
  startAngleRandomness: 1,
  rotateRate: 0,
  rotateRateRandomness: 1,
};
// 粒子发射器环境参数
const config = {
  maxCount: 1000,
  spawnCount: 0.2,
  // once:true,
  fadeIn: true,
  options: options
};

resourceLoader.batchLoad( res, ( err, res ) => {

  if ( err ) return console.error( err );

 for(let i = 0; i < 22; i++) {
  const pos =  position[Math.floor(Math.random() * 8)].slice(0);
  pos[0] -= 4 + (Math.random() -0.5) * 8;
  pos[1] -= 2.5 + (Math.random() -0.5) * 8;
   setTimeout((() => {
    createPlaneGeometry('obj' + i,pos , [0, 0, 0], 8, 5, 1, 1,  res[i % 11].asset);
 }), 500 * i);
 }

// 粒子发射器初始化
  particleComp1.initialize({...{texture: res[11].asset}, ...config});
  // 开始发射粒子
  particleComp1.start();

} );

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 100],
  pixelRatio :2,
  clearParam: [0, 0, 0, 1]
});
// cameraNode.createAbility(AOrbitCotrols);
cameraNode.createAbility(APerspective);
engine.run();




