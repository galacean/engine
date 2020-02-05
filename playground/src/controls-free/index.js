/**
 * 本示例展示如何使用几何体渲染器功能、如何创建几何体资源对象、如何创建材质对象
 */
import {Engine} from '@alipay/o3-core';
import {ADefaultCamera} from '@alipay/o3-default-camera';
import {AGeometryRenderer} from '@alipay/o3-geometry';
import {PlaneGeometry} from '@alipay/o3-geometry-shape'
import {ConstantMaterial} from '@alipay/o3-mobile-material'
import '@alipay/o3-engine-stats';
import createCubeGeometry from './geometry';
import createCubeMaterial from '../common/geometryMaterial';
import {ResourceLoader} from '@alipay/o3-loader';
import {AFreeControls} from '@alipay/o3-free-controls';
import {DrawMode} from '@alipay/o3-base';

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

const resourceLoader = new ResourceLoader(engine);

// 在场景中创建相机节点、配置位置和目标方向
const cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 20], target: [0, 0, 0], far: 2000
});
let controler = cameraNode.createAbility(AFreeControls);
controler.movementSpeed = 100;
controler.rotateSpeed = 1;
controler.jumpY = 50;

const geometry = createCubeGeometry(50);
const material = createCubeMaterial(resourceLoader);

let groundGeometry = new PlaneGeometry(2000, 2000, 100, 100);
groundGeometry.primitive.mode = DrawMode.LINE_STRIP;
let groundMaterial = new ConstantMaterial("groundMat");
groundMaterial.emission = [1, 1, 1, 1];

// meshes in scene
for (let i = 0; i < 100; i++) {
  let cube = rootNode.createChild("cube");
  cube.position = [Math.random() * 2000 - 1000, Math.random() * 200, Math.random() * 2000 - 1000];
  const cubeRenderer = cube.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = geometry;
  cubeRenderer.setMaterial(material);
}
// ground
let ground = rootNode.createChild("ground");
ground.position = [0, -25, 0];
ground.setRotationAngles(-90, 0, 0);
let groundRender = ground.createAbility(AGeometryRenderer);
groundRender.geometry = groundGeometry;
groundRender.material = groundMaterial;

// 启动引擎
engine.run();
