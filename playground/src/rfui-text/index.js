
import { Engine } from '@alipay/r3-core';
import { Logger, TextureFilter, TextureWrapMode } from '@alipay/r3-base';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { RfuiNode, ARfuiRenderer, createTextureFromCanvas, drawText, drawLine, drawBezierLine, drawTextAutoLine, drawEnTextAutoLine } from '@alipay/r3-rfui';
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
  pixelRatio :2,
  clearParam: [0.08, 0.08, 0.2, 1.0]
});

const content = `区块链的应用场景迎来新突破。第一笔汇款由在港工作22年的菲律宾人格蕾丝（Grace）完成，耗时仅3秒，而在以前需要10分钟到几天不等。格蕾丝对镜头里远在菲律宾的家人惊叹：“太酷了！” 在区块链技术的支持下，跨境汇款从此能做到像本地转账一样，实时到账、省钱、省事、安全、透明。这也是继公益捐款、食品溯源、租房管理之后，蚂蚁金服在区块链应用场景的又一次创新探索。`
const enContent = 'The success of Alipay’s Double 12 International Festival has gone global. In Phuket, Thailand, 7-Eleven stores were busy scanning customer’s QR codes. Jokingly, one excited store owner said, “Alipay is the most wonderful language in the world.”';


const textTexture = createTextureFromCanvas('text_texture', 1024, 512, (context) => {
 console.log('width:' + context.measureText(content).width)
 text(content, context, {x: 10, y: 70});
 // enText(enContent, context, {x: 10, y: 70});
});

const titleTexture = createTextureFromCanvas('text_texture', 256, 64, (context) => {
  title('中国 CHINA', context, {x: 50, y: 45});
});

const res = [];
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/yruXCkZEcKfiOMGoenYE.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/qKzXYNTDxKJNNnsppZtX.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/ZQVuDYfMzAVaMieLOTIh.png',
} ));
res.push(new Resource( 'img', {
  type: 'texture',
  url: 'https://gw.alipayobjects.com/zos/rmsportal/igLCByoOsuqOnKnpZsUw.png',
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
  textures.push(titleTexture);
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
  //  bgNode.animationIn();
  // }, 10000);
  bgNode.animationIn();
  // setTimeout(() => {
  //   bgNode.animationOut({onComplete: () => {
  //     bgNode.isActive = false;
  //   }});
  // }, 5000);

  engine.run();
} );

function text(text, context, position) {
  drawTextAutoLine(context, text, position, {
    font: '38px ATEC',
    fillStyle: '#fff',
    lineHeight: 1.8
    // shadowColor: 'rgba(167, 222, 255, 1.0)',
    // shadowBlur: 9
  });
}
function enText(text, context, position) {
  drawEnTextAutoLine(context, text, position, {
    font: '35px ATEC',
    fillStyle: '#fff',
    // shadowColor: 'rgba(167, 222, 255, 1.0)',
    // shadowBlur: 9
  });
}
function title(text, context, position) {
  drawText(context, text, position, {
    font: '30px ATEC',
    fillStyle: '#fff',
    // shadowColor: 'rgba(167, 222, 255, 1.0)',
    // shadowBlur: 9
  });
}
