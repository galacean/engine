import { Logger } from '@alipay/r3-base';
import { Engine } from '@alipay/r3-core';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import { RegistExtension } from '@alipay/r3-loader-gltf';
import { AAnimation } from '@alipay/r3-animation';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { AOrbitControls } from '@alipay/r3-orbit-controls';
import { AEnvironmentMapLight, PBRMaterial } from '@alipay/r3-pbr';
import { ASkyBox } from '@alipay/r3-skybox';
import { ALinearFog, AEXP2Fog } from '@alipay/r3-fog';


import '@alipay/r3-engine-stats';
import * as dat from 'dat.gui';

Logger.enable();
RegistExtension( { PBRMaterial } );

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const gui = new dat.GUI();
gui.domElement.style = 'position:absolute;top:0px;left:50vw';

var fog = rootNode.createAbility( ALinearFog, { color: [1, 0, 0], far: 10 } );
gui.add( fog, 'far', 0.1, 100 );
gui.add( fog, 'enabled' );

var fog2 = rootNode.createAbility( AEXP2Fog, { color: [ 1, 0, 1 ] } );
fog2.enabled = false;
gui.add( fog2, 'density', 0, 1 );
gui.add( fog2, 'enabled' );

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

let environmentMapRes = new Resource('environment', {
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
});

const gltfRes = new Resource('campaign_gltf', {
  type: 'gltf',
  url: './DamangedHelmet/DamagedHelmet.gltf',
});

let cameraProps = {
  canvas: 'r3-demo', position: [0, 0, 5], near: 0.01
};
let camera = cameraNode.createAbility(ADefaultCamera, cameraProps);
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo')});


let node = rootNode.createChild('gltf_node');

resourceLoader.batchLoad([gltfRes, diffuseMapRes, specularMapRes, environmentMapRes], (err, res) => {
  const glb = res[0];
  const nodes = glb.asset.rootScene.nodes;
  nodes.forEach(n => {
    node.addChild(n);
  });

  envLight.diffuseMap = res[1].asset;
  envLight.specularMap = res[2].asset;
  node.createAbility(ASkyBox, { skyBoxMap: res[3].asset });

  const animations = glb.asset.animations;
  const animator = node.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name );
  });

  // animator.playAnimationClip('BusterDrone');

});

//-- run
engine.run();
