import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { AGeometryRenderer } from '@alipay/o3-geometry';
import '@alipay/o3-engine-stats';
import createCubeGeometry from './geometry';
import createBaseCube from './baseCube.js';
import { createCubeMaterial } from './geometryMaterial';
import ARotation from '../common/ARotation';
import { ResourceLoader } from '@alipay/o3-loader';
import * as dat from 'dat.gui';

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;
const config = {
  count: 5000,
  method: 'instanced'
};

const gui = new dat.GUI();
let instancedGeo;

const resourceLoader = new ResourceLoader(engine);

const cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'o3-demo', position: [0, 10, 40], target: [0, 0, 0]
});

let timeout = null;

initInstanced();

function initInstanced() {
  const cube = rootNode.createChild("cube");
  cube.createAbility(ARotation);
  const cubeRenderer = cube.createAbility(AGeometryRenderer);
  instancedGeo = createCubeGeometry(0.5);
  cubeRenderer.geometry = instancedGeo;
  cubeRenderer.setMaterial(createCubeMaterial(resourceLoader));
  instancedGeo.instancedCount = 5000;
}

function initNonInstanced() {
  const cubeGroup = rootNode.createChild("cube");
  for (let i = 0; i < config.count; i++) {
    const cube = cubeGroup.createChild();
    const offset = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
    cube.position = [offset[0] * 13, offset[1] * 13, offset[2] * 13];
    const cubeRenderer = cube.createAbility(AGeometryRenderer);
    const geometry = createBaseCube(0.5);
    cubeRenderer.geometry = geometry;
    cubeRenderer.setMaterial(createCubeMaterial(resourceLoader));
  }
  cubeGroup.createAbility(ARotation);
}

function clean() {
  const cube = rootNode.children.filter(node => node.name === 'cube')[0];
  cube.destroy();
}

gui.add(config, "method", ["instanced", "non-instanced"]).onChange(v => {
  clean();
  if (v === 'instanced') {
    initInstanced();
  }
  if (v === 'non-instanced') {
    initNonInstanced();
  }
});


gui.add(config, 'count', 0, 50000).onChange(v => {
  if (config.method === 'instanced') {
    instancedGeo.instancedCount = v;
  }
  if (config.method === 'non-instanced') {
    debounce(updateNonInstanced, 500)();
  }
});

function updateNonInstanced() {
  clean();
  initNonInstanced();
}

// 启动引擎
engine.run();

function debounce(fn, wait, options) {
  wait = wait || 0;

  function debounced() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(function() {
      fn();
    }, wait);
  }
  return debounced;
}
