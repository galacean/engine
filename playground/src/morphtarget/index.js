import { Logger, TextureFilter } from '@alipay/o3-base';
import { Engine } from '@alipay/o3-core';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { RegistExtension } from '@alipay/o3-loader-gltf';
import { AAnimation } from '@alipay/o3-animation';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { AEnvironmentMapLight, PBRMaterial } from '@alipay/o3-pbr';
import { ASkyBox } from '@alipay/o3-skybox';

import '@alipay/o3-engine-stats';
Logger.enable();
RegistExtension( { PBRMaterial } );
//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

let envLightNode = rootNode.createChild('env_light');
let envLight = envLightNode.createAbility(AEnvironmentMapLight);

const resourceLoader = new ResourceLoader(engine);

//-- create camera
let cameraNode = rootNode.createChild('camera_node');

let diffuseMapRes = new Resource('dif', {
  type: 'cubemap',
  urls: [
    './env/papermill/diffuse/diffuse_right_0.jpg',
    './env/papermill/diffuse/diffuse_left_0.jpg',
    './env/papermill/diffuse/diffuse_top_0.jpg',
    './env/papermill/diffuse/diffuse_bottom_0.jpg',
    './env/papermill/diffuse/diffuse_front_0.jpg',
    './env/papermill/diffuse/diffuse_back_0.jpg',
  ],
});

let environmentMapRes = new Resource('dif', {
  type: 'cubemap',
  urls: [
    './env/papermill/environment/environment_right_0.jpg',
    './env/papermill/environment/environment_left_0.jpg',
    './env/papermill/environment/environment_top_0.jpg',
    './env/papermill/environment/environment_bottom_0.jpg',
    './env/papermill/environment/environment_front_0.jpg',
    './env/papermill/environment/environment_back_0.jpg',
  ],
});

let specularMapRes = new Resource('env', {
  type: 'cubemap',
  urls: [
    [
      './env/papermill/specular/specular_right_0.jpg',
      './env/papermill/specular/specular_left_0.jpg',
      './env/papermill/specular/specular_top_0.jpg',
      './env/papermill/specular/specular_bottom_0.jpg',
      './env/papermill/specular/specular_front_0.jpg',
      './env/papermill/specular/specular_back_0.jpg',
    ],
    [
      './env/papermill/specular/specular_right_1.jpg',
      './env/papermill/specular/specular_left_1.jpg',
      './env/papermill/specular/specular_top_1.jpg',
      './env/papermill/specular/specular_bottom_1.jpg',
      './env/papermill/specular/specular_front_1.jpg',
      './env/papermill/specular/specular_back_1.jpg',
    ],
    [
      './env/papermill/specular/specular_right_2.jpg',
      './env/papermill/specular/specular_left_2.jpg',
      './env/papermill/specular/specular_top_2.jpg',
      './env/papermill/specular/specular_bottom_2.jpg',
      './env/papermill/specular/specular_front_2.jpg',
      './env/papermill/specular/specular_back_2.jpg',
    ],
    [
      './env/papermill/specular/specular_right_3.jpg',
      './env/papermill/specular/specular_left_3.jpg',
      './env/papermill/specular/specular_top_3.jpg',
      './env/papermill/specular/specular_bottom_3.jpg',
      './env/papermill/specular/specular_front_3.jpg',
      './env/papermill/specular/specular_back_3.jpg',
    ],
    [
      './env/papermill/specular/specular_right_4.jpg',
      './env/papermill/specular/specular_left_4.jpg',
      './env/papermill/specular/specular_top_4.jpg',
      './env/papermill/specular/specular_bottom_4.jpg',
      './env/papermill/specular/specular_front_4.jpg',
      './env/papermill/specular/specular_back_4.jpg',
    ],
    [
      './env/papermill/specular/specular_right_5.jpg',
      './env/papermill/specular/specular_left_5.jpg',
      './env/papermill/specular/specular_top_5.jpg',
      './env/papermill/specular/specular_bottom_5.jpg',
      './env/papermill/specular/specular_front_5.jpg',
      './env/papermill/specular/specular_back_5.jpg',
    ],
    [
      './env/papermill/specular/specular_right_6.jpg',
      './env/papermill/specular/specular_left_6.jpg',
      './env/papermill/specular/specular_top_6.jpg',
      './env/papermill/specular/specular_bottom_6.jpg',
      './env/papermill/specular/specular_front_6.jpg',
      './env/papermill/specular/specular_back_6.jpg',
    ],
    [
      './env/papermill/specular/specular_right_7.jpg',
      './env/papermill/specular/specular_left_7.jpg',
      './env/papermill/specular/specular_top_7.jpg',
      './env/papermill/specular/specular_bottom_7.jpg',
      './env/papermill/specular/specular_front_7.jpg',
      './env/papermill/specular/specular_back_7.jpg',
    ],
    [
      './env/papermill/specular/specular_right_8.jpg',
      './env/papermill/specular/specular_left_8.jpg',
      './env/papermill/specular/specular_top_8.jpg',
      './env/papermill/specular/specular_bottom_8.jpg',
      './env/papermill/specular/specular_front_8.jpg',
      './env/papermill/specular/specular_back_8.jpg',
    ],
    [
      './env/papermill/specular/specular_right_9.jpg',
      './env/papermill/specular/specular_left_9.jpg',
      './env/papermill/specular/specular_top_9.jpg',
      './env/papermill/specular/specular_bottom_9.jpg',
      './env/papermill/specular/specular_front_9.jpg',
      './env/papermill/specular/specular_back_9.jpg',
    ],

  ],
  config: {
    magFilter: TextureFilter.LINEAR,
    minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
  }
});

const gltfRes = new Resource('campaign_gltf', {
  type: 'gltf',
  url: './AnimatedMorphSphere/glTF/AnimatedMorphSphere.gltf',
});

const lutRes = new Resource('lut', {
  type: 'texture',
  url: './env/brdfLUT.png',
});

let cameraProps = {
  canvas: 'o3-demo', position: [0, 0, 5], near: 0.01
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('o3-demo')});


let node = rootNode.createChild('gltf_node');

resourceLoader.batchLoad([gltfRes, lutRes, diffuseMapRes, specularMapRes, environmentMapRes], (err, res) => {
  const glb = res[0];
  const nodes = glb.asset.rootScene.nodes;
  nodes.forEach(n => {
    node.addChild(n);
  });

  const lut = res[1].asset;
  envLight.brdfMap = lut;
  envLight.diffuseMap = res[2].asset;
  envLight.specularMap = res[3].asset;
  node.createAbility(ASkyBox, { skyBoxMap: res[4].asset });

  const animations = glb.asset.animations;
  const animator = node.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name );
  });

  animator.playAnimationClip('Globe');

});

//-- run
engine.run();
