import { vec3, vec4 } from '@alipay/o3-math';
import { Logger, MaskList } from '@alipay/o3-base';
import { Engine } from '@alipay/o3-core';
import { RegistExtension } from '@alipay/o3-loader-gltf';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { SphereGeometry } from '@alipay/o3-geometry-shape';
import { LambertMaterial } from '@alipay/o3-mobile-material';
import { CuboidGeometry } from '@alipay/o3-geometry-shape';
import { PostProcessFeature, addDepthPass, BloomEffect, GodraysEffect, ColorCorrectionEffect, SMAAEffect } from '@alipay/o3-post-processing';
import { AAmbientLight, ADirectLight } from '@alipay/o3-lighting';
import '@alipay/o3-engine-stats';

import * as dat from 'dat.gui';

let params = {
  godRayIntensity: 0.3,
  godRayLong: 0.8,
  colorR: 0.9, 
  colorG: 0.9,
  colorB: 1.0,
};

// 体积光参数控制
let gui = new dat.GUI();
let godRayIntensityController = gui.add( params, 'godRayIntensity', 0, 2);
let godRayLongController = gui.add( params, 'godRayLong', 0, 20);
let colorRController = gui.add( params, 'colorR', 0, 1);
let colorGController = gui.add( params, 'colorG', 0, 1);
let colorBController = gui.add( params, 'colorB', 0, 1);
gui.open();
gui.domElement.style = 'position:absolute;top:0px;left:50vw';

Logger.enable();

let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

let cameraNode = rootNode.createChild('camera_node');
let cameraProps = {
  canvas: 'o3-demo', clearParam: [0, 0, 0, 1], position: [30, -40, 50], near: 1, far: 400, attributes: { antialias: false}
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('o3-demo') });
 
// 创建方向光
let light = rootNode.createChild("light");
light.createAbility(AAmbientLight, {
  color: vec3.fromValues(0.75, 0.25, 0.25)
});

// 构建太阳球体
let sunNode = rootNode.createChild('sun_node');
let sunWorldPosition = sunNode.worldPosition = [2, 50, -20];
let sphereMtl = new LambertMaterial('TestMaterial', false);
sphereMtl.ambient = vec4.fromValues( 1.0, 0.9, 0.9, 0.9 );
let sunRenderer = sunNode.createAbility(AGeometryRenderer);
sunRenderer.geometry = new SphereGeometry(3, 32, 32);
sunRenderer.setMaterial(sphereMtl);

const postProcess = scene.findFeature(PostProcessFeature);
postProcess.initRT(4096, 4096);


// 获取深度纹理图
const sceneDepthRT = addDepthPass(camera, MaskList.MASK1, 1024);

// 添加godrays效果
const godrays = new GodraysEffect(postProcess);
godrays.depthTexture = sceneDepthRT.texture;
godrays.sunScreen = sunWorldPosition;
godrays.godRayIntensity = 0.6; 
godrays.godRayLong = 0.8; 
godrays.color = [0.9, 0.9, 1.0]; 
postProcess.addEffect(godrays); 

godRayIntensityController.onChange(function(value) {
  godrays.godRayIntensity = value; 
});
godRayLongController.onChange(function(value) {
  godrays.godRayLong = value; 
});
colorRController.onChange(function(value) {
  godrays.color[0] = value; 
});
colorGController.onChange(function(value) {
  godrays.color[1] = value; 
});
colorBController.onChange(function(value) {
  godrays.color[2] = value; 
});


// 构建立方体
const mtl = new LambertMaterial('cube_mtl', false);
mtl.ambient = vec4.fromValues( 0.0, 1.0, 0.0, 1 );
createCuboidGeometry('cube1', [0, 2, 0], 5, 5, 5, mtl);
const mtl2 = new LambertMaterial('cube_mtl', false);
mtl2.ambient = vec4.fromValues( 1.0, 0.0, 0.0, 1 );
createCuboidGeometry('cube2', [-2, 3, 17], 6, 6, 6, mtl2);
const mtl3 = new LambertMaterial('cube_mtl', false);
mtl3.ambient = vec4.fromValues( 0.0, 0.0, 1.0, 1 );
createCuboidGeometry('cube2', [2, -3, -17], 4, 4, 4, mtl3);

engine.run();

function createCuboidGeometry(name, position, w, h, d, mtl) {

  let node = rootNode.createChild(name);
  node.position = position;
  node.setRotationAngles(0, 45, 0);

  let renderer = node.createAbility(AGeometryRenderer);
  renderer.geometry = new CuboidGeometry(w, h, d);
  renderer.setMaterial(mtl);
  renderer.addPassMasks(MaskList.MASK1);
}
