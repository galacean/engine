import World from './World.js';
import AssetsLoader from './AssetsLoader.js';
import { vec3 } from '@alipay/o3-math';
import { ADirectLight } from '@alipay/o3-lighting';
import { AOrbitControls } from '@alipay/o3-orbit-controls';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import { CuboidGeometry, CylinderGeometry } from '@alipay/o3-geometry-shape';
import { LambertMaterial } from '@alipay/o3-mobile-material';
import { Texture2D } from '@alipay/o3-material';
import { Node } from '@alipay/o3-core';
import {
  AssetManager,
  ASpineRenderer
} from '@alipay/o3-spine';
import { spine } from '@alipay/o3';

let assetManager;
let atlas;
let atlasLoader;

const atlasFile =
"https://gw.alipayobjects.com/os/Naya/b9db5199-3254-46a2-91b2-1759b2141b6c/home/admin/release/app/controller/tmp/temp-dc76800d3a5904332bc6c8e0be83719a/bahe.atlas"
const skeletonFile =
"https://gw.alipayobjects.com/os/Naya/1fa818e4-4af4-4d70-8291-a1eb2d54db5b/home/admin/release/app/controller/tmp/temp-dc76800d3a5904332bc6c8e0be83719a/bahe.json"
const textureFile =
"https://gw.alipayobjects.com/zos/Naya/e0d4fef1-9205-48a5-9e1d-9ac5f9c43959/home/admin/release/app/controller/tmp/temp-dc76800d3a5904332bc6c8e0be83719a/bahe.png"

const canvas = document.getElementById('o3-demo');
const world = new World(canvas);
world.camera.createAbility(AOrbitControls, { canvas });
world.camera.position = [0, 0, 300];

const loader = new AssetsLoader();
loader.addAsset('model', {
  type: 'gltf',
  url: 'https://gw.alipayobjects.com/os/basement_prod/4974b5b8-b2ba-4767-86e6-e3e61416c88f.gltf',
});

loader.addAsset('decal_texture', {
  type: 'texture',
  url: 'https://gw.alicdn.com/tfs/TB1JsjnIBLoK1RjSZFuXXXn0XXa-300-300.png',
});

loader.load().then(res => {
  const gltf = res[0];
  const model = gltf.asset.rootScene.nodes[0];
  addLight();
  loadSpine();
  world.start();
});

function addShip(model) {
  world.addChild(model);
}

function addLight() {
  const light = world.createChild('light');
  light.position = [3, 3, 5];
  light.setRotationAngles(30, 200, 0);
  light.createAbility(ADirectLight, {
    color: vec3.fromValues(1, 1, 1),
    intensity: 1.2,
  });
  const light2 = world.createChild('light');
  light2.position = [3, 3, -5];
  light2.createAbility(ADirectLight, {
    color: vec3.fromValues(1, 1, 1),
    intensity: 1.2,
  });
}

function loadSpine() {
  assetManager = new AssetManager();
  assetManager.loadText(skeletonFile);
  assetManager.loadTexture(textureFile);
  assetManager.loadText(atlasFile);
  assetManager.onLoad().then(() => {
    initSpine();
  });
}

function initSpine() {
  const atlas = new spine.TextureAtlas(assetManager.get(atlasFile), function(path) {
    return assetManager.get(textureFile);
  });
  atlasLoader = new spine.AtlasAttachmentLoader(atlas);

  const skeletonJson = new spine.SkeletonJson(atlasLoader);

  skeletonJson.scale = 0.4;
  const skeletonData = skeletonJson.readSkeletonData(assetManager.get(skeletonFile));

  const skeletonNode = world.createChild("skeleton");

  const spineRenderer = skeletonNode.createAbility(ASpineRenderer, { asset: skeletonData });

  spineRenderer.state.setAnimation(0, "animation", true);

  skeletonNode.position = [-150, 250, 0];
}
