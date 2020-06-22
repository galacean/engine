import { Logger } from '@alipay/o3-base';
import { Engine,Script} from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { SphereGeometry, CuboidGeometry } from '@alipay/o3-geometry-shape';
import { ADirectLight, AAmbientLight } from '@alipay/o3-lighting';
import { vec3 } from '@alipay/o3-math';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import ALightColor from '../common/ALightColor';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { SeaMaterial } from './SeaMaterial';

import * as dat from 'dat.gui';

class OceanScript extends Script {
  mtl;
  controls;
  onUpdate()
  {
    this.mtl.setValue('u_sea_height', this.controls.sea_height);
    this.mtl.setValue('u_water_scale', this.controls.water_scale);
    this.mtl.setValue('u_water_speed', this.controls.water_speed);
  
    let base = vec3.create();
    this.mtl.setValue('u_sea_base', vec3.scale(base, this.controls.sea_base, 1.0 / 256.));
    let wColor = vec3.create();
    this.mtl.setValue('u_water_color', vec3.scale(wColor, this.controls.water_color, 1.0 / 256.));
  }
}


Logger.enable();

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const canvas = document.getElementById('o3-demo');
const cameraNode = rootNode.createChild('camera_node');
const camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: canvas, position: [0, 5, 8], target: [0, 0, 0],
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById('o3-demo') });
controler.minDistance = 4;
controler.maxDistance = 50;

let light = rootNode.createChild('light1');
light.createAbility(AAmbientLight);
light.createAbility(ALightColor, AAmbientLight);

// 创建方向光
let light2 = rootNode.createChild('light2');
light2.createAbility(ADirectLight, {
  color: vec3.fromValues(0.4, 0.6, 0.75),
  intensity: 0.8,
});
light2.setRotationAngles(30, 140, 0);

const resourceLoader = new ResourceLoader(engine);

// 创建材质（可以渲染漫反射的 Lambert 材质）
const mtl = new SeaMaterial('sea_mtl');

var controls = new function() {
  this.sea_height = 0.6;
  this.water_scale = 0.2;
  this.water_speed = 3.5;

  this.water_color = [0.8 * 256, 0.9 * 256, 0.6 * 256];
  this.sea_base = [0.1 * 256, 0.19 * 256, 0.22 * 256];
};

var gui = new dat.GUI();
gui.add(controls, 'sea_height', 0, 3);
gui.add(controls, 'water_scale', 0, 4);
gui.add(controls, 'water_speed', 0, 4);
gui.addColor(controls, 'water_color');
gui.addColor(controls, 'sea_base');
gui.domElement.style = 'position:absolute;top:0px;right:300px';

const oceanScript= rootNode.addComponent(OceanScript);
oceanScript.mtl=mtl;
oceanScript.controls=controls;

// 创建球体形的海面
createSphereGeometry('sphere3', [0, 0, 0], 3, 50, 50);

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

  return node;
}


const techRes = new Resource('image', {
  type: 'texture',
  url: '/static/texture/effect-sea/00.jpg',
});

resourceLoader.load(techRes, (err, res) => {
  const texture = res.asset;
  mtl.setValue('u_texture', texture);
});
