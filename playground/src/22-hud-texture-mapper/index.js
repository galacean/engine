'use strict';
import { HUDFeature }  from '@alipay/r3-hud';
import '@alipay/r3-hud';
import { Engine } from '@alipay/r3-core';
import { Logger } from '@alipay/r3-base';
import { vec3 } from '@alipay/r3-math';
import { ADefaultCamera } from '@alipay/r3-default-camera';

import '@alipay/r3-engine-stats';
import { AHUDLayer } from '../common/AHUDLayer';
import { AHUDLabel } from "../common/AHUDLabel";
import { Sprite, ASpriteRenderer } from "@alipay/r3-2d";
import "@alipay/r3-2d";
import { ADynamicChange } from "./ADynamicChange";

Logger.enable();

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
let hudFeature = scene.findFeature(HUDFeature);
hudFeature.initTexture(1024, 512);

let row = 0, col = 0;
let xOffset = -1.5, yOffset = 0;
let colWidth = 1.2, rowHeight = 1.5;

let widgets = [];

for (let i = 0; i < 9; i++) {
  let r = Math.floor(Math.random() * 255);
  let g = Math.floor(Math.random() * 255);
  let b = Math.floor(Math.random() * 255);
  let a = 1;
  let backgroundStyle = 'rgba(' + r + ',' +g + ',' + b + ',' + a + ')';

  let width = 100 + Math.floor(Math.random() * 100);
  let height = 50 + Math.floor(Math.random() * 100);
  let worldSize = [width/150, height/150];
  let layerProps = {
    spriteID: 'layer' + i,
    textureSize: [width, height],
    renderMode: '3D',
    worldSize,
    backgroundStyle
  };
  const layerNode = rootNode.createChild('layer' + i);
  layerNode.position = vec3.fromValues(xOffset + col * colWidth, yOffset + row * rowHeight, 0);
  const layer = layerNode.createAbility(AHUDLayer, layerProps);
  widgets.push(layer);

  col++;
  if (col >= 3) {
    col = 0;
    row++;
  }
}

const dynamicChange = rootNode.createAbility(ADynamicChange);
dynamicChange.setWidgetsInfo(widgets);

//-- Texture分配情况展示
let labelProps = {
  spriteID: 'label',
  textureSize: [200, 60],
  renderMode: '3D',
  worldSize: [1, 0.3],
};
const labelNode = rootNode.createChild('label');
labelNode.position = vec3.fromValues(-1.6, -1.6, 0);
const label = labelNode.createAbility(AHUDLabel, labelProps);
label.text = "HUD Texture:";

let rect = {
  x: 0,
  y: 0,
  width: 1024,
  height: 512,
};

const texNode = rootNode.createChild('wholeTexture');
texNode.position = [0, -3, 0];
texNode.scale = [0.2, 0.2, 1];
const sprite = new Sprite(hudFeature.texture, rect);
const spriteRenderer = texNode.createAbility(ASpriteRenderer, sprite);

engine.run();




