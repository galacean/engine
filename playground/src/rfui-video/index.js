
import { Engine } from '@alipay/o3-core';
import { Logger, TextureFilter, TextureWrapMode } from '@alipay/o3-base';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { ARfuiRenderer } from '@alipay/o3-rfui';
import { Texture2D } from '@alipay/o3-material';
import '@alipay/o3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/o3-loader';

Logger.enable();
//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;


// 创建资源对象，参数分别为对象名，资源类型，资源路径
const res = [];
res.push(new Resource( 'video', {
  type: 'texture',
  url: require('./AoDaLiYa_1.mp4'),
  handlerType: 'video'
} ));

const resourceLoader = new ResourceLoader(engine);

resourceLoader.batchLoad( res, ( err, res ) => {

  if ( err ) return console.error( err );

  let obj = createPlaneGeometry('obj1', [-2, -2, -0.1],[0, 0, 0], 4, 4, 1, 1, res[0].asset);
  engine.run();

  setTimeout(() => {
    res[0].asset.image.play();
  obj.isActive = true;

}, 3000);
} );

let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 10],
  pixelRatio :2
});


function createPlaneGeometry(name, position,rotation, w, h, hs,vs, texture, flag) {
  let obj = rootNode.createChild(name);
  obj.scale = [ w, h, 1];
  obj.setRotationAngles(rotation[0], rotation[1], rotation[2]);
  let cubeRenderer = obj.createAbility(ARfuiRenderer, {
    diffuse: texture,
    isAnimatingTexture: true
  });

  obj.isActive = false;
  return obj;
}
