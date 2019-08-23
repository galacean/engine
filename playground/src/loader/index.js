import {ClearMode, AssetType} from '@alipay/o3-base';
import {Engine} from '@alipay/o3-core';
import {vec3} from '@alipay/o3-math';
import {GLRenderHardware} from '@alipay/o3-rhi-webgl';
import {SceneRenderer} from '@alipay/o3-renderer-cull';
import {ResourceLoader, Resource} from '@alipay/o3-loader';
import '@alipay/o3-loader-gltf';
import {TextureFilter, TextureWrapMode} from '@alipay/o3-core';
import staticTechnique from './static_technique.json';
import skinTechnique from './skin_technique.json';
import {AAnimation} from '@alipay/o3-animation';
import {ADefaultCamera} from '@alipay/o3-default-camera';

import '@alipay/o3-engine-stats';

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild('camera');

const textureRes = new Resource('test_texture', {
  type: 'texture',
  url: 'https://private-alipayobjects.alipay.com/alipay-rmsdeploy-image/rmsportal/PoiZxlaqdQpjlvrtQhXK.png',
  assetType: AssetType.Scene
});

// const localGLTF = new Resource('test_local_glb', {
//   type: 'gltf',
//   url: './gltf/fairy_big.gltf'
// });

const glbRes = new Resource('test_glb', {
  type: 'glb',
  url: 'https://private-alipayobjects.alipay.com/alipay-rmsdeploy-image/rmsportal/pjNTzuGpeoGBfJfiVVkq.r3bin',
});

const animationRes = new Resource('fairy_glb', {
  type: 'glb',
  url: 'https://private-alipayobjects.alipay.com/alipay-rmsdeploy-image/rmsportal/gFNSbyyYpRwnMIyCpAib.r3bin',
  assetType: AssetType.Scene
});

const gltfRes = new Resource('campaign_gltf', {
  type: 'gltf',
  url: 'https://gw.alipayobjects.com/os/r3/3d645aa3-b466-4b54-9b4b-9c1fc0396adf/campaign_building_default.gltf',
});

const techRes = new Resource('test_technique', {type: 'technique', data: staticTechnique, assetType: AssetType.Scene});
const skinTechRes = new Resource('test_skin_technique', {
  type: 'technique',
  data: skinTechnique,
  assetType: AssetType.Scene
});

let cameraProps = {
  RHI: GLRenderHardware,
  SceneRenderer: SceneRenderer,
  canvas: 'o3-demo',
  attributes: {antialias: true, depth: true}
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);

cameraNode.position = [0, 20, 20];
cameraNode.lookAt(vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));
camera.setPerspective(45, 480, 640, 1, 1000);
camera.setClearMode(ClearMode.SOLID_COLOR, [0.25, 0.25, 0.25, 1.0]);

let node = rootNode.createChild('gltf_node');

// load resource config
// resourceLoader.loadConfig
resourceLoader.batchLoad([animationRes, techRes, skinTechRes, textureRes, gltfRes], (err, res) => {
  const glb = res[0];

  const fairyPrefab = glb.asset.rootScene.nodes[0];

  const animations = glb.asset.animations;

  const fairy1 = fairyPrefab.clone();
  const fairy2 = fairyPrefab.clone();

  fairy1.rotateByAngles(0, 180, 0);
  fairy2.rotateByAngles(0, 130, 0);
  fairy1.scale = [3, 3, 3];
  fairy2.scale = [3, 3, 3];
  fairy1.position = [0, -10, 0];
  fairy2.position = [0, 3, 0];

  node.addChild(fairy1);
  node.addChild(fairy2);

  const animator = fairy1.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  animator.playAnimationClip('run24f');

  const animator2 = fairy2.createAbility(AAnimation);

  animations.forEach(clip => {
    animator2.addAnimationClip(clip, clip.name);
  });

  animator2.playAnimationClip('click25f');

});

//-- run
engine.run();
