import { Engine } from '@alipay/o3-core';
import { vec3 } from '@alipay/o3-math';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import '@alipay/o3-loader-gltf';
import { TextureFilter, TextureWrapMode } from '@alipay/o3-core';
import { AAnimation, AnimationEvent, WrapMode } from '@alipay/o3-animation';
import '@alipay/o3-hud';
import { AHUDLabel } from "../common/AHUDLabel";

import '@alipay/o3-engine-stats';

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;

//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 1.35, 5.5], target: [0, 1.1, 0]
});

// load resource config
const animationRes = new Resource('pig_glb', {
  type: 'gltf',
  url: 'https://gw.alipayobjects.com/os/r3/43bf0cbe-17c8-4835-88ff-f28636dd2b14/pig.gltf',
});
const resourceLoader = new ResourceLoader(engine);
// resourceLoader.loadConfig
resourceLoader.load(animationRes, (err, gltf) => {
  const pigPrefab = gltf.asset.rootScene.nodes[0];
  const animations = gltf.asset.animations;

  const pig = pigPrefab.clone();

  pig.rotateByAngles(0, 180, 0);

  let node = rootNode.createChild('gltf_node');
  node.addChild(pig);

  let book = pig.findChildByName('book_one');
  book.isActive = false;

  const animator = pig.createAbility(AAnimation);

  animations.forEach(clip => {
    animator.addAnimationClip(clip, clip.name);
  });

  //-- create hud
  let bodyNode = node.findChildByName('Bip01');

  let labelNode = bodyNode.createChild('labelNode');
  labelNode._ownerScene = scene;
  labelNode.position = vec3.fromValues(0, 0, -1.5);
  let labelProps = {
    spriteID: 'label',
    textureSize: [400, 120],
    renderMode: '3D',
    worldSize: [1.5, 0.3],
  };
  const label = labelNode.createAbility(AHUDLabel, labelProps);
  label.backgroundStyle = 'rgba(112, 128, 105, 1)';
  label.text = "扭";

  let cb = ()=>{ label.text = "迈左腿"; };
  let cb2 = ()=>{ label.text = "迈右腿"; };
  let cb3 = ()=>{ label.text = "结束了"; animator.playAnimationClip('walk'); };
  let playConfig = {
    wrapMode: WrapMode.ONCE,
    events: [
      { type: AnimationEvent.FRAME_EVENT, triggerTime: 0.5, callback: cb },
      { type: AnimationEvent.LOOP_END, callback: cb2 },
      { type: AnimationEvent.FINISHED, callback: cb3 }
    ]
  };
  animator.playAnimationClip('walk', playConfig);

});

//-- run
engine.run();
