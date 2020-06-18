import { Logger } from '@alipay/o3-base';
import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { SphereGeometry, CuboidGeometry } from '@alipay/o3-geometry-shape';
import { LambertMaterial } from '@alipay/o3-mobile-material';
import { ADirectLight, AAmbientLight } from '@alipay/o3-lighting';
import { vec3, vec4 } from '@alipay/o3-math';
import { createLineMaterial } from "./LineMaterial";
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { AMarchingLineRenderer } from './AMarchingLineRenderer';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { MarchingLine } from "./MarchingLine";
import ALightColor from "../common/ALightColor";
import { PlaneMarchingRule, SphereMarchingRule } from "./MarchingRule";
import {ARoateControl} from "./ARoateControl";

Logger.enable();

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const canvas = document.getElementById('o3-demo');
const cameraNode = rootNode.createChild('camera_node');
cameraNode.createAbility(ADefaultCamera, {
  canvas: canvas, position: [0, 5, 15], target: [0, 0, 0]
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById('o3-demo')});
controler.minDistance = 4;
controler.maxDistance = 50;
controler.enableRotate = false;

let light = rootNode.createChild("light1");
light.createAbility(AAmbientLight);
light.createAbility(ALightColor, AAmbientLight);

// 创建方向光
let light2 = rootNode.createChild("light2");
light2.createAbility(ADirectLight, {
  color: vec3.fromValues(0.4, 0.6, 0.75),
  intensity: 0.8
});
light2.setRotationAngles(30, 140, 0);

// 创建材质（可以渲染漫反射的 Lambert 材质）
const mtl = new LambertMaterial('sphere_mtl', false);

// 创建球体 和 线条
// createSphereGeometry('sphere3', [0, 0, 0], 3, 50, 50);

// 创建立方体 和 线条
let cube = createCuboidGeometry('cuboid', [0, 0, 0], 3);
let rotateControl = cube.createAbility(ARoateControl, { canvas: canvas });

// 启动引擎
engine.run();

function createSphereGeometry(name, position, r, h, v, as, ae, ts, te) {
  // 在场景中创建 cube 节点
  let node = rootNode.createChild(name);
  node.position = position;
  // 绑定几何体渲染器
  let renderer = node.createAbility(AGeometryRenderer);
  // 创建并绑定基础几何体
  renderer.geometry = new SphereGeometry(r, h, v, as, ae, ts, te);
  // 绑定材质
  renderer.setMaterial(mtl);

  // 创建线条材质
  let lineMtl = createLineMaterial(new ResourceLoader(rootNode.engine));
  // 绑定线条渲染器
  let lineRenderer = node.createAbility(AMarchingLineRenderer, { material: lineMtl });

  const onHit = (e)=>{
    lineRenderer.addLine(e.lines[0]);
    lineRenderer.addLine(e.lines[1]);
  };

  lineRenderer.addLine(new MarchingLine(new SphereMarchingRule(r, null, null, onHit), 0.015));
  lineRenderer.addLine(new MarchingLine(new SphereMarchingRule(r, null, null, onHit), 0.015));
  lineRenderer.addLine(new MarchingLine(new SphereMarchingRule(r, null, null, onHit), 0.015));
  lineRenderer.addLine(new MarchingLine(new SphereMarchingRule(r, null, null, onHit), 0.015));

  return node;
}

function createCuboidGeometry(name, position, w) {
  // 在场景中创建 cube 节点
  let node = rootNode.createChild(name);
  node.position = position;
  // 绑定几何体渲染器
  let renderer = node.createAbility(AGeometryRenderer);
  // 创建并绑定基础几何体
  renderer.geometry = new CuboidGeometry(w,w,w);
  // 绑定材质
  renderer.setMaterial(mtl);

  // 创建线条材质
  let lineMtl = createLineMaterial(new ResourceLoader(rootNode.engine));
  // 绑定线条渲染器
  let lineRenderer = node.createAbility(AMarchingLineRenderer, { material: lineMtl });

  lineRenderer.addLine(new MarchingLine(new PlaneMarchingRule([1, 0, 0], -Math.PI/2, w, 'flower')));
  lineRenderer.addLine(new MarchingLine(new PlaneMarchingRule([1, 0, 0], 0, w, 'love')));
  lineRenderer.addLine(new MarchingLine(new PlaneMarchingRule([0, 1, 0], -Math.PI/2, w, 'spiral')));

  return node;
}
