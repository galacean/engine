import { Logger } from '@alipay/o3-base';
import { Engine } from '@alipay/o3-core';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { AAnimation } from '@alipay/o3-animation';
import { ADirectLight, APointLight } from '@alipay/o3-lighting';
import { vec3 } from '@alipay/o3-math';
import '@alipay/o3-loader-gltf';
import '@alipay/o3-shadow';
import { Sprite, ASpriteRenderer } from "@alipay/o3-2d";

import { ConstantMaterial, BlinnPhongMaterial } from '@alipay/o3-mobile-material';
import { PlaneGeometry } from "../common/PlaneGeometry";
import { ACircleMove } from './ACircleMove';

Logger.enable();

let engine = new Engine();
let resourceLoader = new ResourceLoader(engine);

let scene = engine.currentScene;
let rootNode = scene.root;

//-- 创建相机
let cameraNode = rootNode.createChild('camera_node');
cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, -8], target: [0, 0, 0]
});

//-- 创建一个点光源和一个方向光
let lgtNode1 = rootNode.createChild("light1");
lgtNode1.position = [1, 2, -2];
lgtNode1.lookAt([0, 0, 0], [0, 1, 0]);
let directLight = lgtNode1.createAbility(ADirectLight, {
  color: vec3.fromValues(0.25, 0.25, 0.25),
  intensity: 1.0
});
directLight.enableShadow = true;
directLight.shadow.setMapSize(1024, 1024);

let lgtNode2 = rootNode.createChild("light2");
let pointLight = lgtNode2.createAbility(APointLight, {
  color: vec3.fromValues(0.2, 0.2, 0.2),
  intensity: 1.0,
  distance: 10,
  decay: 0
});
lgtNode2.position = [1, 2, 2];
lgtNode2.lookAt([0, 0, 0], [0, 1, 0]);
lgtNode2.onUpdate = ()=> { lgtNode2.lookAt([0, -1, 0], [0, 1, 0]); };
lgtNode2.createAbility(ACircleMove, { range: 2});
pointLight.enableShadow = true;
pointLight.shadow.setMapSize(1024, 1024);
pointLight.shadow.bias = 0.0001;
pointLight.shadow.radius = 5;

//-- 显示 shadow map
showShadowMap(pointLight, directLight);

//-- 创建可以接收阴影的平面
const planeRenderer = createPlane(rootNode);
planeRenderer.recieveShadow = true;

//-- 加载小猪动画资源
const animationRes = new Resource('pig_glb', {
  type: 'gltf',
  url: 'https://gw.alipayobjects.com/os/r3/43bf0cbe-17c8-4835-88ff-f28636dd2b14/pig.gltf',
});

resourceLoader.batchLoad([animationRes], (err, res) => {

  //-- create pig
  let gltf = res[0].assets[0];

  // let mtl = new BlinnPhongMaterial('TestMaterial', false);
  // mtl.diffuse = res[0].assets[0];
  // mtl.ambient = vec4.fromValues(0.25, 0.25, 0.25, 1);

  // let pigMtl = [];
  //
  // pigMtl[0] = new ConstantMaterial('PigMaterial0', true);
  // pigMtl[0].emission = gltf.textures[0];
  //
  // pigMtl[1] = new BlinnPhongMaterial('PigMaterial1', true, true);
  // pigMtl[1].emission = gltf.textures[1];
  // pigMtl[1].diffuse = vec4.fromValues(0.25, 0.25, 0.25, 1.0);
  //
  // pigMtl[2] = pigMtl[1];
  //
  // let meshes = gltf.meshes;
  // let mtlIndex = 0;
  // for (let i = 0; i < meshes.length; i++) {
  //   let mesh = meshes[i];
  //   for (let j = 0; j < mesh.primitives.length; j++) {
  //     mesh.primitives[j].material = pigMtl[i];
  //     mtlIndex++;
  //   }
  // }

  const pigPrefab = gltf.rootScene.nodes[0];
  const animations = gltf.animations;

  const pig = pigPrefab.clone();
  pig.position = [0, -1, 0];
  pig.rotateByAngles(0, 0, 0);
  rootNode.addChild(pig);

  let book = pig.findChildByName('book_one');
  book.isActive = false;

  const animator = pig.createAbility(AAnimation);
  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip('walk');

  // 设置小猪 "投射" 阴影
  pig.castShadow = true;

});

function createPlane(rootNode) {

  let planeNode = rootNode.createChild('plane');
  planeNode.position = [0, -1, 0];
  let planeRenderer = planeNode.createAbility(AGeometryRenderer);
  planeRenderer.geometry = new PlaneGeometry(6, 6);
  let planeMtl = new ConstantMaterial('ConstMaterial', false);
  planeMtl.emission = [1.0, 1.0, 1.0, 1.0];
  planeRenderer.setMaterial(planeMtl);
  planeNode.rotateByAngles(250, 0, 0);

  return planeRenderer;
}

function showShadowMap(pointLight, directLight) {

  let lights = [pointLight, directLight];
  let positions = [[-1.8, 2.3, 0], [-1.8, 1.0, 0]];
  for (let i = 0; i < lights.length; i++) {
    const texNode = rootNode.createChild('shadowMapNode');
    texNode.position = positions[i];
    texNode.scale = [0.10, 0.10, 1];
    const sprite = new Sprite(lights[i].shadow.map, { x:0, y: 0, width:512, height:512 });
    texNode.createAbility(ASpriteRenderer, sprite);
  }

}

//-- run
engine.run();

