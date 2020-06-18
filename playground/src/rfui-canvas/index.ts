
import { Engine } from '@alipay/o3-core';
import { Logger, TextureFilter, TextureWrapMode } from '@alipay/o3-base';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { ARfuiRenderer, createTextureFromCanvas, drawText, drawLine, drawBezierLine } from '@alipay/o3-rfui';
import { Texture2D } from '@alipay/o3-material';
import '@alipay/o3-engine-stats';

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


const texture = createTextureFromCanvas('text_texture', 256, 256, (context) => {
  text('绘制文字1', context, {x: 10, y: 70});
  text('绘制文字2', context,  {x: 10, y: 140});
  text('绘制文字3', context,  {x: 10, y: 210});
  // line(context);
  // bezierLine(context);
});

let obj = rootNode.createChild('obj1');
  obj.scale = [ 4, 5, 1];
  let cubeRenderer = obj.createAbility(ARfuiRenderer, {
    diffuse: texture
  });

engine.run();


function line(context){
  const startPoint = {
    x: 10,
    y: 250
  }

  const pathPoint = [
    {
      x: 90,
      y: 150,
    },
    {
      x: 150,
      y: 190
    },
    {
      x: 250,
      y: 130
    },
    {
      x: 320,
      y: 280
    },
    {
      x: 390,
      y: 210
    }
  ]

  drawLine(context, startPoint, pathPoint, {
    strokeStyle: 'rgba(100, 12, 80, 0.5)',
    lineWidth: 5,
  });
}
function bezierLine(context, lastX, lastY, hue) {
  const startPoint = {
    x: 10,
    y: 250
  }

  const controlPoint = {
    cp1x: 90,
    cp1y: 150,
    cp2x: 250,
    cp2y: 130,
    x: 390,
    y: 210
  }

  drawBezierLine(context, startPoint, controlPoint, {
    strokeStyle: 'rgba(80, 120, 180, 0.5)',
    lineWidth: 5,
  });
}

function text(text, context, position) {
  var gradient=context.createLinearGradient(0,0,512,0);
  gradient.addColorStop("0","magenta");
  gradient.addColorStop("0.5","blue");
  gradient.addColorStop("1.0","red");
  drawText( context, text, position, {
    font: '40px Arial',
    fillStyle: gradient,
    shadowColor: 'rgba(255, 255, 255, 1.0)',
    shadowBlur: 20
  });
}
