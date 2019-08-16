import { Engine } from '@alipay/r3-core';
import { Logger } from '@alipay/r3-base';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { HUDFeature } from '@alipay/r3-hud';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import { AOrbitControls } from '@alipay/r3-orbit-controls';
import '@alipay/r3-engine-stats';

import { AHUDImage } from '../common/AHUDImage';
import { AHUDLabel } from "../common/AHUDLabel";
import { ALineShape } from "./ALineShape";
import { createBallMaterial } from "./BallMaterial"
import { createLineMaterial } from "./LineMaterial";

Logger.enable();

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 10], target: [0, 0, 0]
});
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo')});
controler.minDistance = 4;
controler.maxDistance = 50;

const resourceLoader = new ResourceLoader(engine);

const skeletonTextureRes = new Resource('gameStart_texture', {
  type: 'image',
  url: './skeleton.png',
});

resourceLoader.batchLoad([skeletonTextureRes], (err, res) => {

  const gameStartImage = res[0].data;

  //-- image
  // if (gameStartImage) {
  //   const imageProps = {
  //     spriteID: 'gameStartImage',
  //     textureSize: [512, 512],
  //     renderMode: '3D',
  //     worldSize: [2, 2],
  //     image: gameStartImage
  //   };
  //   const imageNode = rootNode.createChild('image');
  //   imageNode.position = [-2, -3, 0];
  //   const image = imageNode.createAbility(AHUDImage, imageProps);
  // }


  //-- label
  const labelProps = {
    spriteID: 'label',
    textureSize: [512, 512],
    renderMode: '3D',
    worldSize: [2, 2]
  };
  const labelNode = rootNode.createChild('label');
  labelNode.position = [-2, -3, 0];
  const label = labelNode.createAbility(AHUDLabel, labelProps);
  label.font = '300px monospace';
  label.text = 'LOVE';//'Bird';//'YINI';//

  //-- create line shape
  const shapeNode = rootNode.createChild('lineShape');
  // 创建线条材质
  const props = {
    lineMaterial: createLineMaterial(resourceLoader),
    ballMaterial: createBallMaterial(resourceLoader),
    canvas: scene.findFeature(HUDFeature).texture.canvas
  };

  // 绑定线条渲染器
  let shape = shapeNode.createAbility( ALineShape, props );


});


engine.run();
