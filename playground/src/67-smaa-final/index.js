/**
 * 本示例展示如何使用几何体渲染器功能、如何创建几何体资源对象、如何创建材质对象
 */
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import '@alipay/o3-engine-stats';
import createCubeGeometry from './geometry';
import createCubeMaterial from '../common/geometryMaterial';
import ARotation from '../common/ARotation';
import { ResourceLoader } from '@alipay/o3-loader';
import { PostProcessFeature, SMAAEffect, VignetteEffect } from '@alipay/o3-post-processing';
import { Logger } from '@alipay/o3-base';

Logger.enable();

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;
const scene1 = engine.addScene();
const rootNode1 = scene1.root;
const scene2 = engine.addScene();
const rootNode2 = scene2.root;
const scene3 = engine.addScene();
const rootNode3 = scene3.root;

const resourceLoader = new ResourceLoader(engine);

// 在场景中创建相机节点、配置位置和目标方向
const cameraNode = rootNode.createChild('camera_node');
const pixelRatio = 2;
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 10, 20], target: [0, 0, 0], pixelRatio, attributes: { antialias: true }
});
camera.setViewport(0 * pixelRatio , 320 * pixelRatio , 240  * pixelRatio, 320 * pixelRatio );

const cameraNode1 = rootNode1.createChild('camera');
let camera1 = cameraNode1.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 10, 20], target: [0, 0, 0], pixelRatio, //clearMode: 0
});
camera1.setViewport( 240 * pixelRatio , 320 * pixelRatio , 240 * pixelRatio , 320 * pixelRatio  );

const cameraNode2 = rootNode2.createChild('camera_node');
let camera2 = cameraNode2.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 10, 20], target: [0, 0, 0], pixelRatio, attributes: { antialias: true }, clearMode:0
});
camera2.setViewport(0 * pixelRatio, 0 * pixelRatio, 240 * pixelRatio, 320 * pixelRatio);

const cameraNode3 = rootNode3.createChild('camera_node');
let camera3 = cameraNode3.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 10, 20], target: [0, 0, 0], pixelRatio,
});
camera3.setViewport(240 * pixelRatio, 0 * pixelRatio, 240 * pixelRatio, 320 * pixelRatio);

// 在场景中创建 cube 节点
const cube = rootNode.createChild("cube");
// 在 cube 节点上绑定自动旋转功能
cube.createAbility(ARotation);
// 在 cube 节点上绑定几何体渲染器功能、引用几何体资源对象、添加材质对象
const cubeRenderer = cube.createAbility(AGeometryRenderer);
cubeRenderer.geometry = createCubeGeometry(3);
cubeRenderer.setMaterial(createCubeMaterial(resourceLoader));

// 在场景中创建 cube 节点
const cube1 = rootNode1.createChild("cube");
// 在 cube 节点上绑定自动旋转功能
cube1.createAbility(ARotation);
// 在 cube 节点上绑定几何体渲染器功能、引用几何体资源对象、添加材质对象
const cubeRenderer1 = cube1.createAbility(AGeometryRenderer);
cubeRenderer1.geometry = createCubeGeometry(3);
cubeRenderer1.setMaterial(createCubeMaterial(resourceLoader));

// 在场景中创建 cube 节点
const cube2 = rootNode2.createChild("cube");
// 在 cube 节点上绑定自动旋转功能
cube2.createAbility(ARotation);
// 在 cube 节点上绑定几何体渲染器功能、引用几何体资源对象、添加材质对象
const cubeRenderer2 = cube2.createAbility(AGeometryRenderer);
cubeRenderer2.geometry = createCubeGeometry(3);
cubeRenderer2.setMaterial(createCubeMaterial(resourceLoader));

// 在场景中创建 cube 节点
const cube3 = rootNode3.createChild("cube");
// 在 cube 节点上绑定自动旋转功能
cube3.createAbility(ARotation);
// 在 cube 节点上绑定几何体渲染器功能、引用几何体资源对象、添加材质对象
const cubeRenderer3 = cube3.createAbility(AGeometryRenderer);
cubeRenderer3.geometry = createCubeGeometry(3);
cubeRenderer3.setMaterial(createCubeMaterial(resourceLoader));

const postProcess = scene1.findFeature(PostProcessFeature);
postProcess.initRT(240 * pixelRatio, 320 * pixelRatio, {clearMode:0});

const vignette = new VignetteEffect(postProcess);
postProcess.addEffect(vignette);
vignette.color = [0.1, 0, 0];

const postProcess1 = scene3.findFeature(PostProcessFeature);
postProcess1.initRT(240 * pixelRatio, 320 * pixelRatio, {clearMode:0});

const smaa = new SMAAEffect(postProcess1);
postProcess1.addEffect(smaa);

const vignette1 = new VignetteEffect(postProcess1);
postProcess1.addEffect(vignette1);
vignette1.color = [0, 0, 0.1];

// 启动引擎
engine.run();
