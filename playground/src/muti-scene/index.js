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
import { ASpriteRenderer } from "@alipay/o3-2d";
import { ConstantMaterial } from '@alipay/o3-mobile-material';
import { PlaneGeometry } from "../common/PlaneGeometry";
import { ACircleMove } from './ACircleMove';
import { RenderTarget } from '@alipay/o3-material'
import { PostProcessFeature, VignetteEffect } from '@alipay/o3-post-processing';

Logger.enable();

let engine = new Engine();
let resourceLoader = new ResourceLoader(engine);

let scene = engine.currentScene;
let rootNode = scene.root;
let scene1 = engine.addScene();
// scene1.isActive = false;
let rootNode1 = scene1.root;

engine.currentScene = scene1;

//-- 创建相机
let cameraNode = rootNode.createChild('camera_node');
cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, -8], target: [0, 0, 0], clearParam: [1,0,0,1]
});

let cameraNode1 = rootNode1.createChild('camera1_node');
let camera1 = cameraNode1.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, -8], target: [0, 0, 0]
})
let s2RT = new RenderTarget('scene2', { width: 1024, height: 1024, clearColor: [ 0, 1, 1, 1 ] });
camera1.sceneRenderer.defaultRenderPass.renderTarget = s2RT;
showTexture(s2RT.texture);

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

//-- scene1 的光源
let lgtNode11 = rootNode1.createChild("light1");
lgtNode11.position = [1, 2, -2];
lgtNode11.lookAt([0, 0, 0], [0, 1, 0]);
let directLight1 = lgtNode11.createAbility(ADirectLight, {
  color: vec3.fromValues(0.25, 0.25, 0.25),
  intensity: 1.0
});
directLight1.enableShadow = true;
directLight1.shadow.setMapSize(1024, 1024);
//-- 创建可以接收阴影的平面
const planeRenderer = createPlane(rootNode);
planeRenderer.recieveShadow = true;
const planeRenderer1 = createPlane(rootNode1);
planeRenderer1.recieveShadow = true;

//-- 加载小猪动画资源
const animationRes = new Resource('pig_glb', {
  type: 'gltf',
  url: 'https://gw.alipayobjects.com/os/r3/43bf0cbe-17c8-4835-88ff-f28636dd2b14/pig.gltf',
});

resourceLoader.batchLoad([animationRes], (err, res) => {

  //-- create pig
  let gltf = res[0].assets[0];

  const pigPrefab = gltf.rootScene.nodes[0];
  const animations = gltf.animations;

  const pig = pigPrefab.clone();
  pig.position = [0, -1, 0];
  pig.rotateByAngles(0, 0, 0);
  rootNode.addChild(pig);
  const pig1 = pig.clone();
  rootNode1.addChild(pig1);

  let book = pig.findChildByName('book_one');
  book.isActive = false;

  const animator = pig.createAbility(AAnimation);
  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });
  const animator1 = pig1.createAbility( AAnimation);
  animations.forEach(clip => {
    animator1.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip('walk');
  animator1.playAnimationClip('walk');

  // 设置小猪 "投射" 阴影
  pig.castShadow = true;
  pig1.castShadow = true;

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

function showTexture(t) {

  const texNode = rootNode.createChild('shadowMapNode');
  texNode.position = [-1.0, 2.0, 0];
  texNode.scale = [0.2, 0.2, 1];
  texNode.createAbility(ASpriteRenderer, {
    texture: t, 
    rect: { x:0, y: 0, width:512, height:512 }
  });

}
//-- 后处理
const postProcess = scene.findFeature(PostProcessFeature);
postProcess.initRT();
const vignette = new VignetteEffect(postProcess);
postProcess.addEffect(vignette);
vignette.color =[ 1, 0, 0 ]
const postProcess1 = scene1.findFeature(PostProcessFeature);
postProcess1.initRT(512,512,{ clearMode: 0 });
const vignette1 = new VignetteEffect(postProcess);
postProcess1.addEffect(vignette1);
vignette1.color =[ 0, 0, 1 ]

//-- run
engine.run();

