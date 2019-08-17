import { Engine } from '@alipay/o3-core';
import { Logger } from '@alipay/o3-base';
import { vec3 } from '@alipay/o3-math';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { HUDFeature } from '@alipay/o3-hud';
import { ResourceLoader, Resource } from '@alipay/o3-loader';

import '@alipay/o3-engine-stats';
import { AHUDImage } from '../common/AHUDImage';
import { AHUDLayer } from '../common/AHUDLayer';
import { AHUDLabel } from "../common/AHUDLabel";
import { AHUDProgressBar } from "./AHUDProgressBar";

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

const bgTextureRes = new Resource('bg_image', {
  type: 'image',
  url: './bar_bg.png',
});

const fgTextureRes = new Resource('fg_image', {
  type: 'image',
  url: './bar_fg.png'
});

const gameStartTextureRes = new Resource('gameStart_texture', {
  type: 'image',
  url: './game_start.png',
});

resourceLoader.batchLoad([bgTextureRes, fgTextureRes, gameStartTextureRes], (err, res) => {

  const bgImage = res[0].data, fgImage = res[1].data, gameStartImage = res[2].data;

  //-- progress bar
  if (bgImage && fgImage) {
    const barProps = {
      spriteID: 'bar1',
      bgImage,
      fgImage,
      textureSize: [400, 80],
      screenSize: [300, 60]
    };
    const barNode = rootNode.createChild('progressbar');
    const bar = barNode.createAbility(AHUDProgressBar, barProps);
    bar.setRange(0, 20);
    bar.currentValue = 1;
    bar.autoUpdate = true;

  }

  //-- layer
  const layerProps = {
    spriteID: 'layer',
    textureSize: [50, 50],
    renderMode: '3D',
    worldSize: [5, 2],
    backgroundStyle: 'rgba(0, 0, 0, 0.65)'
  };
  const layerNode = rootNode.createChild('layer');
  layerNode.position = [0, 2, 0];
  const layer = layerNode.createAbility(AHUDLayer, layerProps);


  //-- image
  if (gameStartImage) {
    const imageProps = {
      spriteID: 'gameStartImage',
      textureSize: [100, 114],
      renderMode: '3D',
      worldSize: [1, 1.14],
      image: gameStartImage
    };
    const imageNode = rootNode.createChild('image');
    imageNode.position = [0, 2, 0.1];
    const image = imageNode.createAbility(AHUDImage, imageProps);
  }

  //-- label
  const labelProps = {
    spriteID: 'label',
    textureSize: [400, 80]
  };
  let labelNode = rootNode.createChild('label');
  labelNode.position = [0, -2, 0];
  let label = labelNode.createAbility(AHUDLabel, labelProps);
  label.text = 'this is a hud label!';



  // setTimeout(() => {
  //   console.error('destroy');
  //   labelNode.destroy();
  //   labelNode = null;
  //   label = null;
  // }, 5000);

});



engine.run();

// mem test: engine pause/resume
window.addEventListener('keydown', ( e )=> {
  // console.log('e.', e.keyCode);
  if(e.keyCode === 32) {
    engine.pause();
  }
}, false);

window.addEventListener('keyup', ( e )=> {
  // console.log('e.', e.keyCode);
  if(e.keyCode === 32) {
    engine.resume();
  }

}, false);

// setTimeout( () => {
//   engine.pause();
//   console.error('paused');
// }, 4000);

// setTimeout( () => {
//   engine.resume();
//   console.error('resumed');
// }, 5000);

// setTimeout( () => {
//   engine.pause();
//   console.error('paused');
// }, 9000);

// setTimeout( () => {
//   engine.resume();
//   console.error('resumed');
// }, 10000);
