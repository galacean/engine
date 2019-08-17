/**
 * 本示例展示如何使用几何体渲染器功能、如何创建几何体资源对象、如何创建材质对象
 */
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import '@alipay/o3-engine-stats';
import createTrailGeometry from './geometry';
import createTrailMaterial from './material';

import { Resource, ResourceLoader } from '@alipay/o3-loader';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { ConstantMaterial } from '@alipay/o3-mobile-material';
import { UniformSemantic, DataType, RenderState, BlendFunc } from '@alipay/o3-base';

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;
const resourceLoader = new ResourceLoader(engine);


// 在场景中创建相机节点、配置位置和目标方向
const cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 10], target: [0, 0, 0]
});
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('o3-demo')});

// 在场景中创建 cube 节点
const cube = rootNode.createChild("trail");
// 在 cube 节点上绑定几何体渲染器功能、引用几何体资源对象、添加材质对象
const cubeRenderer = cube.createAbility(AGeometryRenderer);
const points = [ [0, 0], [0, 0], [0, 0], [2, 2], [2, 3], [3, 3]];
cubeRenderer.geometry = createTrailGeometry(points);
let mtl = createTrailMaterial();
cubeRenderer.setMaterial(mtl);

engine.run();

// const techRes = new Resource('image', {
//   type: 'texture',
//   url: 'https://gw.alipayobjects.com/zos/rmsportal/pQcQxfDxpnMITSleKCRB.png'
// });
//
// resourceLoader.load(techRes, (err,res) => {
//   const texture = res.asset;
//   mtl.emission = texture;
//   mtl.ambient = [1, 1, 1, 1];
//   engine.run();
// });

// 启动引擎
