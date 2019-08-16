import { Engine } from '@alipay/r3-core';
import { vec3 } from '@alipay/r3-math';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { ResourceLoader, Resource } from '@alipay/r3-loader';
import '@alipay/r3-loader-gltf';
import { TextureFilter, TextureWrapMode } from '@alipay/r3-core';
import { AAnimation, AnimationEvent, WrapMode } from '@alipay/r3-animation';
import '@alipay/r3-hud';

import { AHUDLabel } from "../common/AHUDLabel";

//-- create engine object
let engine = new Engine();

let scene = engine.currentScene;
let rootNode = scene.root;



//-- create camera
let cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 1.35, 5.5], target: [0, 1.1, 0]
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

  animator.playAnimationClip('walk');
  // animator.stop(true);
  // animator.jumpToFrame(600);

  //-- create hud
  let labelProps = {
    spriteID: 'label',
    textureSize: [400, 120],
    renderMode: '3D',
    worldSize: [1.5, 0.3],
  };
  const labelNode = rootNode.createChild('label');
  labelNode.position = vec3.fromValues(-0.75, 2, 0);
  const label = labelNode.createAbility(AHUDLabel, labelProps);
  label.backgroundStyle = 'rgba(112, 128, 105, 1)';
  label.text = "Click change time scale";

  let label2Props = {
    spriteID: 'label2',
    textureSize: [400, 120],
    renderMode: '3D',
    worldSize: [1, 0.2],
  };
  const label2Node = rootNode.createChild('label2');
  label2Node.position = vec3.fromValues(-1, 1.6, 0);
  const label2 = label2Node.createAbility(AHUDLabel, label2Props);
  label2.backgroundStyle = 'rgba(112, 128, 105, 1)';
  label2.text = "Current time scale: " + animator.timeScale;

  let timeScaleValues = [0.1, 0.3, 0.5, 1.0, 2.0, 3.0];
  let timeScaleIndex = 0;
  document.getElementById('r3-demo').addEventListener('click', (e) => {
    if (timeScaleIndex >= timeScaleValues.length) {
      timeScaleIndex = 0;
    }
    animator.timeScale = timeScaleValues[timeScaleIndex++];
    label2.text = "Current time scale: " + animator.timeScale;
  });

});

//-- run
engine.run();
