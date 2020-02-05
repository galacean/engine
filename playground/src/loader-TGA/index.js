import { Engine } from '@alipay/o3-core';
import { vec3 } from '@alipay/o3-math';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import '@alipay/o3-hud';
import '@alipay/o3-loader-gltf';
import { TextureFilter, TextureWrapMode } from '@alipay/o3-core';


import '@alipay/o3-engine-stats';
import { AHUDImage } from "../common/AHUDImage";

// Logger.enable();

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 20, 20], target: [0, 0, 0]
});

// load resource config
const textureRes = new Resource('test_texture', {
  type: 'texture',
  url: require('./9-tga-512.tga'),
});

const resourceLoader = new ResourceLoader(engine);
// resourceLoader.loadConfig
resourceLoader.batchLoad([textureRes], (err, res) => {
  if(err) {
    return;
  };
  const imageData = res[0].data;
  let node = rootNode.createChild('test_node');

  //-- image
  if (imageData) {
    let imageProps = {
      spriteID: 'image',
      textureSize: [512, 512],
      renderMode: '2D',
      image: imageData
    };
    const image = node.createAbility(AHUDImage, imageProps);
    image.worldOffset = [0, 2, 0];
  }

});

//-- run
engine.run();
