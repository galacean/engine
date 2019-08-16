'use strict';

import { Engine } from '@alipay/r3-core';
import { Logger } from '@alipay/r3-base';
import { vec3 } from '@alipay/r3-math';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import '@alipay/r3-hud';
import { ResourceLoader, Resource } from '@alipay/r3-loader';

import '@alipay/r3-engine-stats';
import { AHUDImage } from '../common/AHUDImage';
import { AFade } from "./AFade";
import { AHUDLabel } from "../common/AHUDLabel";

Logger.enable();

window.addEventListener('beforeunload', function (event) {
  console.log('-- Begin Shutdown ------------------------------------');
  engine.shutdown();
});

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 10], target: [0, 0, 0]
});

//-- create hud
let testNode = rootNode.createChild('test');

engine.run();

const resourceLoader = new ResourceLoader(engine);

const fgTextureRes = new Resource('fg_texture', {
  type: 'image',
  url: './bar_fg.png',
});

resourceLoader.load(fgTextureRes, (err, res) => {
  let helpImage = res.data;
  if (!helpImage) {
    return;
  }

  let fadeChannels = ['r', 'g', 'b', 'a'];
  for (let i = 0; i < 4; i++) {
    const labelObj = testNode.createChild('LabelObj');
    labelObj.position = [-1.1, 1 - i * 0.5, 0.1];

    let labelProps = {
      spriteID: 'label' + i,
      textureSize: [200, 160],
      renderMode: '3D',
      worldSize: [1.0, 0.8],
    };
    const label = labelObj.createAbility(AHUDLabel, labelProps);
    label.worldOffset = vec3.fromValues(-1.1, 0, 0);
    label.text = "Fade " + fadeChannels[i];

    const imageFadeObj = testNode.createChild('ImageObj');
    imageFadeObj.position = [0, 1 - i * 0.5, 0.1];

    let imageProps = {
      spriteID: 'helpImage',
      textureSize: [400, 80],
      renderMode: '3D',
      worldSize: [1.2, 0.24],
      image: helpImage
    };
    const imageFade = imageFadeObj.createAbility(AHUDImage, imageProps);
    const fade = imageFadeObj.createAbility(AFade);
    fade.setFade(imageFade, 1000, i);
  }
});



