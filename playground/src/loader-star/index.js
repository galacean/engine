import { Engine,AssetType } from '@alipay/r3-core';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import '@alipay/r3-loader-gltf';
import { Logger } from '@alipay/r3-base';
import { AAnimation } from '@alipay/r3-animation';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { ASkinnedMeshRenderer } from '@alipay/r3-mesh';
import '@alipay/r3-engine-stats';

import { Sprite, ASpriteRenderer } from '@alipay/r3-2d';

import { AOrbitControls } from '@alipay/r3-orbit-controls';
import { TextureMaterial, TransparentMaterial } from '@alipay/r3-mobile-material';
import { WaveMaterial } from "./WaveMaterial";
import { CircleMaterial } from "./CircleMaterial";

import { RegistExtension } from '@alipay/r3-loader-gltf';

RegistExtension({ TextureMaterial, TransparentMaterial, WaveMaterial, CircleMaterial } );
Logger.enable();

const heartUrl = 'https://gw.alipayobjects.com/zos/rmsportal/XczEEiOrlvMCeZmgoQiW.png';
const heartRadius = 3.1;

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

const resourceLoader = new ResourceLoader(engine);

//-- create camera
const cameraRoot = rootNode.createChild('camera_root');
const cameraNode = cameraRoot.createChild('camera');
const camera = cameraNode.createAbility(ADefaultCamera, {
  fov: 45, canvas: 'r3-demo', position: [0, 0, 10], target: [0, 0, 0], clearParam: [0, 0, 0, 0], attributes: { antialias: true, enableCollect: false },
});

let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo') });

//-- load resource
const gltfRes = new Resource('box_gltf', {
  type: 'gltf',
  url: './star/star.gltf', // './star_christmas/star_christmas.gltf' //
});

const textureRes = new Resource('pray', {
  type: 'texture',
  url: heartUrl,
});

const circleRes = new Resource('box_gltf', {
  type: 'gltf',
  url: './circle/Torus01.gltf', //'./star/star.gltf', // './star_christmas/star_christmas.gltf' //
});

resourceLoader.batchLoad([gltfRes, textureRes, circleRes], (err, res) => {
  if(err) {
    debugger
  }

  const circleGlb = res[2];
  const circlePrefab = circleGlb.asset.rootScene.nodes[0];
  const circle = circlePrefab.clone();

  let node = rootNode.createChild('gltf_node');
  node.addChild(circle);

  circle.rotateByAngles(-16, 0, 0);
  circle.position = [0, 0, 0];
  circle.scale = [0.8, 0.8, 0.8];

  const center = circle.createChild('center');
  addHeartNode(center, res[1], 10);

  const glb = res[0];
  const starPrefab = glb.asset.rootScene.nodes[0];
  const animations = glb.asset.animations;
  const star = starPrefab.clone();

  // let node = rootNode.createChild('gltf_node');
  node.addChild(star);

  star.rotateByAngles(0, 180, 0);
  star.position = [0, -0.3, 0];

  //
  const starBody = star.findChildByName('Dummy001');
  const starMeshNode = star.findChildByName('start');
  const skinMeshRenderer = starMeshNode.findAbilityByType(ASkinnedMeshRenderer);
  const mtl = skinMeshRenderer.getSharedMaterial(0);
  let time = 0;
  starBody.onUpdate = (deltaTime)=>{
    time += deltaTime / 1000;
    if (time > 6.0 * Math.PI) {
      time %= 6.0 * Math.PI
    }
    mtl.cycleTime = time;
    mtl.bodyPosition = starBody.position;
  }

  const animator = star.createAbility(AAnimation);
  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });
  //fly big_02  idle smile up_hand
  animator.playAnimationClip('idle');

});

//-- run
engine.run();

function addHeartNode(node, res, nums) {
  for (let index = 0; index < nums; index++) {
    const heart = node.createChild('heart-' + index);
    // heart.rotateByAngles(0, 180, 0);
    heart.position = getHeartPosition(nums, index);
    heart.scale = [0.3, 0.3, 1];
    // CY
    const rect = {
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    };
    const sprite = new Sprite(res.asset, rect);
    const spriteRenderer = heart.createAbility(ASpriteRenderer, sprite);
    // spriteRenderer.separateDraw = true;
  }
}

function getHeartPosition(nums, index) {
  const x = Math.sin(2 * parseFloat(Math.PI) * index / nums) * heartRadius;
  const y = -Math.cos(2 * parseFloat(Math.PI) * index / nums) * heartRadius;
  return [
    x,
    y,
    0,
  ];
}
