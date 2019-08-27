'use strict';

import { Engine } from '@alipay/o3-core';
import { Logger } from '@alipay/o3-base';
import { vec3 } from '@alipay/o3-math';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import '@alipay/o3-hud';
import { ResourceLoader, Resource } from '@alipay/o3-loader';

import '@alipay/o3-engine-stats';
import { AHUDImage } from '../common/AHUDImage';
import { AHUDLayer } from '../common/AHUDLayer';
import { ARangeMove } from './ARangeMove';
import { AHUDLabel } from "../common/AHUDLabel";

Logger.enable();

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 10], target: [0, 0, 0]
});


const resourceLoader = new ResourceLoader(engine);
const bgTextureRes = new Resource('bg_texture', {
  type: 'image',
  url: require('./bar_bg.png'),
});

function create3DWidgets(testNode, helpImage) {
  const rootObj = testNode.createChild('3DRootObj');
  rootObj.position = [0, 2, 0.1];

  let labelProps = {
    spriteID: 'label1',
    textureSize: [200, 100],
    renderMode: '3D',
    worldSize: [2.0, 1.0],
  };
  const labelNode = rootObj.createChild('labelNode');
  labelNode.position = vec3.fromValues(-1.2, 1, 0);
  const label = labelNode.createAbility(AHUDLabel, labelProps);
  label.text = "RenderMode 3D Z Test";

  let imageProps = {
    spriteID: 'helpImage',
    textureSize: [400, 80],
    renderMode: '3D',
    worldSize: [1.2, 0.24],
    image: helpImage
  };
  const imageObj = rootObj.createChild('imageObj');
  const image = imageObj.createAbility(AHUDImage, imageProps);
  const imageMove = imageObj.createAbility(ARangeMove);
  imageMove.setRangeMove([0, 0, -1], [0, 0, 1], [0, 0, -0.05]);

  const maskObj = rootObj.createChild('maskObj');
  let maskProps = {
    spriteID: 'mask',
    textureSize: [80, 80],
    renderMode: '3D',
    worldSize: [2, 2],
    backgroundStyle: 'rgba(0, 0, 0, 0.65)'
  };
  const mask = maskObj.createAbility(AHUDLayer, maskProps);
  const maskMove = maskObj.createAbility(ARangeMove);
  maskMove.setRangeMove([0, 0, -1], [0, 0, 1], [0, 0, 0.05]);
}

function create2DWidgets(testNode, helpImage) {
  const rootObj = testNode.createChild('2DRootObj');
  rootObj.position = [0, -1.5, 0.1];

  let labelProps = {
    spriteID: 'label2',
    textureSize: [300, 100],
    renderMode: '2D',
    screenSize: [200, 100],
  };
  const labelNode = rootObj.createChild('labelNode');
  labelNode.position = vec3.fromValues(-1.2, 1, 0);
  const label = labelNode.createAbility(AHUDLabel, labelProps);
  label.text = "RenderMode 2D Z Test";

  let imageProps = {
    spriteID: 'helpImage',
    textureSize: [400, 80],
    renderMode: '2D',
    screenSize: [150, 30],
    image: helpImage
  };
  const imageObj = rootObj.createChild('imageObj');
  const image = imageObj.createAbility(AHUDImage, imageProps);
  const imageMove = imageObj.createAbility(ARangeMove);
  imageMove.setRangeMove([0, 0, -1], [0, 0, 1], [0, 0, -0.05]);

  const maskObj = rootObj.createChild('maskObj');
  let maskProps = {
    spriteID: 'mask',
    textureSize: [80, 80],
    renderMode: '2D',
    screenSize: [200, 150],
    backgroundStyle: 'rgba(0, 0, 0, 0.65)'
  };
  const mask = maskObj.createAbility(AHUDLayer, maskProps);
  const maskMove = maskObj.createAbility(ARangeMove);
  maskMove.setRangeMove([0, 0, -1], [0, 0, 1], [0, 0, 0.05]);
}

resourceLoader.load(bgTextureRes, (err, res) => {
  let helpImage = res.data;
  if (!helpImage) {
    return;
  }

  let testNode = rootNode.createChild('test');

  //-- create renderMode: 3D widgets
  create3DWidgets(testNode, helpImage);

  //-- create renderMode: 2D widgets
  create2DWidgets(testNode, helpImage)
});


engine.run();
