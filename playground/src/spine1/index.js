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
import { spine } from '@alipay/spine-core';

let assetManager;
let atlas;
let atlasLoader;

const atlasFile =
"https://gw.alipayobjects.com/os/Naya/ef7942c1-8159-4c2a-84f6-343218f3ab40/home/admin/release/app/controller/tmp/temp-10c1989c1c5fa07e7fe2a3908ad30cdd/%25CE%25A6%25C3%25AC%25C3%25AB%25CF%2583%25C2%25A2%25E2%2595%259B0107-spine-1.atlas"
const skeletonFile =
"https://gw.alipayobjects.com/os/Naya/ec763100-aeab-4c29-862e-8efc4897ea50/home/admin/release/app/controller/tmp/temp-10c1989c1c5fa07e7fe2a3908ad30cdd/%25CE%25A6%25C3%25AC%25C3%25AB%25CF%2583%25C2%25A2%25E2%2595%259B0107-spine-1.json"
const textureFile =
"https://gw.alipayobjects.com/zos/Naya/242f0ea2-a002-46a7-b3df-8fdbe19e20b1/home/admin/release/app/controller/tmp/temp-10c1989c1c5fa07e7fe2a3908ad30cdd/%25CE%25A6%25C3%25AC%25C3%25AB%25CF%2583%25C2%25A2%25E2%2595%259B0107-spine-1.png"

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
  requestAnimationFrame(load);
}

function load(name, scale) {
  if (assetManager.isLoadingComplete()) {
    atlas = new spine.TextureAtlas(assetManager.get(atlasFile), function(path) {
      return assetManager.get(textureFile);
    });
    atlasLoader = new spine.AtlasAttachmentLoader(atlas);

    const skeletonJson = new spine.SkeletonJson(atlasLoader);

    skeletonJson.scale = 0.4;
    const skeletonData = skeletonJson.readSkeletonData(assetManager.get(skeletonFile));

    const skeletonNode = world.createChild("skeleton");

    const spineRenderer = skeletonNode.createAbility(ASpineRenderer, skeletonData);

    spineRenderer.state.setAnimation(0, "animation", true);

    skeletonNode.position = [-75, -60, 0];
  } else requestAnimationFrame(load);
}
