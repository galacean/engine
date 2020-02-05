
import { Engine } from '@alipay/o3-core';
import { Logger, TextureFilter, TextureWrapMode } from '@alipay/o3-base';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { RfuiNode, ARfuiRenderer, createTextureFromCanvas, drawText, drawLine, drawBezierLine } from '@alipay/o3-rfui';
import { Texture2D } from '@alipay/o3-material';
import '@alipay/o3-engine-stats';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import ARotation from '../common/ARotation';
import { getNodesConfig } from './rfuiConfig';

Logger.enable();
//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 0, 10],
  pixelRatio :2
});

const textTexture = createTextureFromCanvas('text_texture', 256, 256, (context) => {
  text('中国', context, {x: 90, y: 140});
});

const res = [];
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/bjrhHXehIzxTHxCincOr.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/JZDfGMCSHxfjkasyJVWL.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/ddloGyJabJiytcQLXcED.png',
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
  const duration = 1000
  const nodesConfig = getNodesConfig(textures, duration);

  const bgNode = new RfuiNode('map', {
    scene,
    parent,
    nodesConfig,
    animationParam: {
      duration,
    }
  });
  setTimeout(() => {

  bgNode.animationIn();
  }, 5000);

// bgNode.scale = [4, 4, 4];
  setTimeout(() => {
    bgNode.animationOut({onComplete: () => {
      bgNode.isActive = false;
    }});
  }, 2000);

  engine.run();
} );

function text(text, context, position) {
  var gradient=context.createLinearGradient(0,0,512,0);
  gradient.addColorStop("0","magenta");
  gradient.addColorStop("0.5","blue");
  gradient.addColorStop("1.0","red");
  drawText( context, text, position, {
    font: '40px Arial',
    fillStyle: '#5689aa',
    // shadowColor: 'rgba(255, 255, 255, 1.0)',
    // shadowBlur: 20
  });
}
