/**
 * @title Scene Background
 * @category Scene
 * @thumbnail https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*5w6_Rr6ML6IAAAAAAAAAAAAAARQnAQ
 */
import * as dat from "dat.gui";
import {
  AssetType,
  BackgroundMode,
  Camera,
  PrimitiveMesh,
  SkyBoxMaterial,
  TextureCube,
  Texture2D,
  WebGLEngine,
  Scene,
} from "@galacean/engine";

import { OrbitControl } from "@galacean/engine-toolkit-controls";

import { addGUI } from "./gui";
import { material_list } from "./material-list";

async function setupDefaultScene(scene: Scene){
  const root = scene.createRootEntity();
  const cameraEntity = root.createChild();
  cameraEntity.transform.setPosition(0, 0, 10);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);
}

async function start() {
  const engine = await WebGLEngine.create({
    canvas: document.getElementById('canvas') as HTMLCanvasElement
  });

  engine.canvas.resizeByClientSize();
  engine.canvas._webCanvas.addEventListener("onresize", () => {
    engine.canvas.resizeByClientSize();
  });

  const scene = engine.sceneManager.activeScene;
  setupDefaultScene(engine.sceneManager.activeScene);
  
  engine.run();
  
  // @ts-ignore
  const [cubeMap1, cubeMap2, texture] = await engine.resourceManager.load<[TextureCube, TextureCube, Texture2D]>(material_list);
  
  const { background } = scene;
  const skyMaterial = (background.sky.material = new SkyBoxMaterial(engine)); // 添加天空盒材质
  skyMaterial.texture = cubeMap1; // 设置立方体纹理
  background.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2); // 设置天空盒网格
  background.texture = texture;
  addGUI([cubeMap1, cubeMap2], background);
}

start();

