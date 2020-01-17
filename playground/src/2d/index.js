import { Engine, AssetType } from '@alipay/o3-core';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import '@alipay/o3-loader-gltf';
import { Logger } from '@alipay/o3-base';
import { AAnimation } from '@alipay/o3-animation';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { ASkinnedMeshRenderer } from '@alipay/o3-mesh';
import '@alipay/o3-engine-stats';

import { Sprite, ASpriteRenderer } from '@alipay/o3-2d';

import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { TextureMaterial, TransparentMaterial } from '@alipay/o3-mobile-material';
import { WaveMaterial } from "./WaveMaterial";
import { CircleMaterial } from "./CircleMaterial";

import { RegistExtension } from '@alipay/o3-loader-gltf';

RegistExtension({ TextureMaterial, TransparentMaterial, WaveMaterial, CircleMaterial });
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
  fov: 45,
  canvas: 'o3-demo',
  position: [0, 0, 10],
  target: [0, 0, 0],
  clearParam: [0, 0, 0, 0],
  attributes: { antialias: true, enableCollect: false },
});

let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('o3-demo') });

//-- load resource
const textureRes = new Resource('pray', {
  type: 'texture',
  url: heartUrl,
});

const circleRes = new Resource('box_gltf', {
  type: 'gltf',
  url: '/static/model/circle/Torus01.gltf', //'./star/star.gltf', // './star_christmas/star_christmas.gltf' //
});

resourceLoader.batchLoad([textureRes, circleRes], (err, res) => {
  if (err) {
    console.log(err)
  }

  const circleGlb = res[1];
  const circlePrefab = circleGlb.asset.rootScene.nodes[0];
  const circle = circlePrefab.clone();

  let node = rootNode.createChild('gltf_node');
  node.addChild(circle);

  circle.rotateByAngles(-16, 0, 0);
  circle.position = [0, 0, 0];
  circle.scale = [0.8, 0.8, 0.8];

  const center = circle.createChild('center');
  addHeartNode(center, res[0], 10);
});

//-- run
engine.run();

function addHeartNode (node, res, nums) {
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
    heart.createAbility(ASpriteRenderer, sprite);
  }
}

function getHeartPosition (nums, index) {
  const x = Math.sin(2 * parseFloat(Math.PI) * index / nums) * heartRadius;
  const y = -Math.cos(2 * parseFloat(Math.PI) * index / nums) * heartRadius;
  return [
    x,
    y,
    0,
  ];
}
