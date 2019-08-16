
import { Engine } from '@alipay/r3-core';
import { Logger, TextureFilter, TextureWrapMode } from '@alipay/r3-base';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { RfuiNode, ARfuiRenderer, createTextureFromCanvas, drawText, drawLine, drawBezierLine } from '@alipay/r3-rfui';
import { Texture2D } from '@alipay/r3-material';
import '@alipay/r3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import ARotation from '../common/ARotation';
import { getNodesConfig } from './rfuiConfig';

Logger.enable();
//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 10],
  pixelRatio :2
});

const textTexture = createTextureFromCanvas('text_texture', 256, 256, (context) => {
  text('绘制文字1', context, {x: 25, y: 70});
  text('绘制文字2', context,  {x: 25, y: 140});
  text('绘制文字3', context,  {x: 25, y: 210});
});

const res = [];
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/QzfBjcWFaJsojRKUtivK.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/uAFgRLGKtPLXItXgspNH.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/dbQISztSsfOPauhyeInL.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/QbKzmBjqNLNdrmkiKusI.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/ghMYiTdzZUAtEdlljFDK.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/qfMgPoHAxOlnxDaeZbgu.png',
} ));


let parent = rootNode.createChild('rfui-wrapper');

const resourceLoader = new ResourceLoader(engine);
const textures = [];
resourceLoader.batchLoad( res, ( err, res ) => {

  if ( err ) return console.error( err );
  res.forEach((r) => {
    textures.push(r.asset);
  });

  textures.push(textTexture);
  const nodesConfig = getNodesConfig(textures, 300);

  const bgNode = new RfuiNode('map', {
    scene,
    parent,
    nodesConfig,
    animationParam: {
      duration: 300
    }
  });
  // setTimeout(() => {

  bgNode.animationIn();
  // }, 6000);

// bgNode.scale = [4, 4, 4];
  // setTimeout(() => {
  //   bgNode.animationOut({onComplete: () => {
  //     bgNode.isActive = false;
  //   }});
  // }, 5000);

  engine.run();
} );

function text(text, context, position) {
  var gradient=context.createLinearGradient(0,0,512,0);
  gradient.addColorStop("0","magenta");
  gradient.addColorStop("0.5","blue");
  gradient.addColorStop("1.0","red");
  drawText( context, text, position, {
    font: '30px Arial',
    fillStyle: '#fff',
    shadowColor: 'rgba(167, 222, 255, 1.0)',
    shadowBlur: 9
  });
}
