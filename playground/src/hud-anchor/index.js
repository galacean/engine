import { Engine } from '@alipay/o3-core';
import { Logger } from '@alipay/o3-base';
import { vec3 } from '@alipay/o3-math';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import '@alipay/o3-hud';
import { ResourceLoader, Resource } from '@alipay/o3-loader';

import '@alipay/o3-engine-stats';
import { AHUDImage } from '../common/AHUDImage';
import { AHUDLayer } from '../common/AHUDLayer';
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

//-- create hud
let labelNode = rootNode.createChild('descLabel');
labelNode.position = vec3.fromValues(-1.7, 4, 0);
let labelProps = {
  textureSize: [300, 60],
  screenSize: [200, 40]
};
const label = labelNode.createAbility(AHUDLabel, labelProps);
label.text = "click change anchor";

engine.run();

const resourceLoader = new ResourceLoader(engine);

const bgTextureRes = new Resource('bg_texture', {
  type: 'image',
  url: './bar_bg.png',
});

resourceLoader.batchLoad([bgTextureRes], (err, res) => {
  let helpImage = res[0].data;
  if (!helpImage) {
    return;
  }

  let labelNode = rootNode.createChild('labelNode');
  labelNode.position = vec3.fromValues(0, 2, 0);
  let labelProps = {
    spriteID: 'label2',
    textureSize: [200, 150],
    screenSize: [150, 100],
    renderMode: '2D',
  };
  const label = labelNode.createAbility(AHUDLabel, labelProps);
  label.text = "Anchor Middle";


  let imageNode = rootNode.createChild('imageNode');
  imageNode.position = vec3.fromValues(0, 1, 0);
  let imageProps = {
    spriteID: 'helpImage',
    textureSize: [400, 80],
    screenSize: [200, 40],
    renderMode: '2D',
    image: helpImage
  };
  const image = imageNode.createAbility(AHUDImage, imageProps);

  let layerNode = rootNode.createChild('layerNode');
  layerNode.position = vec3.fromValues(0, -0.5, 0);
  let layerProps = {
    spriteID: 'layer',
    textureSize: [200, 100],
    renderMode: '3D',
    worldSize: [2, 1],
    backgroundStyle: 'rgba(112, 128, 105, 1)'
  };
  const layer = layerNode.createAbility(AHUDLayer, layerProps);

  let anchorValues = [[0, 0.5], [0.5, 0.5],  [1, 0.5]];
  let anchorDesc = ['Left', 'Middle', 'Right'];
  let index = 0;
  document.getElementById('o3-demo').addEventListener('click', (e) => {
    if (index >= anchorValues.length) {
      index = 0;
    }

    let anchorValue = anchorValues[index];
    layer.anchor = anchorValue;
    image.anchor = anchorValue;
    label.anchor = anchorValue;
    label.text = "Anchor " + anchorDesc[index];

    index++
  });

});



