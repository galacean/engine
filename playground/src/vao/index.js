/**
 * 本示例展示如何使用几何体渲染器功能、如何创建几何体资源对象、如何创建材质对象
 */
import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import "@alipay/o3-engine-stats";
import { createCubeGeometry } from "./geometry";
import createCubeMaterial from "../common/geometryMaterial";
import { ResourceLoader } from "@alipay/o3-loader";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import { GLCapabilityType, UpdateType } from "@alipay/o3-base";
import * as dat from "dat.gui";
const gui = new dat.GUI();

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

const resourceLoader = new ResourceLoader(engine);

// 在场景中创建相机节点、配置位置和目标方向
const cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [2000, 2000, 2000],
  target: [0, 0, 0],
  far: 10000
});

let controler = cameraNode.createAbility(AOrbitControls);

const geometry = createCubeGeometry(50);
const material = createCubeMaterial(resourceLoader);

// meshes in scene
const radius = 1000;
for (let i = 0; i < 10000; i++) {
  let cube = rootNode.createChild("cube");
  cube.position = [
    Math.random() * radius * 2 - radius,
    Math.random() * radius * 2 - radius,
    Math.random() * radius * 2 - radius
  ];
  const cubeRenderer = cube.createAbility(AGeometryRenderer);
  cubeRenderer.geometry = geometry;
  cubeRenderer.setMaterial(material);
}

// 启动引擎
engine.run();

const canIUseVAO = camera.renderHardware.canIUse(GLCapabilityType.vertexArrayObject);
const capability = camera.renderHardware.capability.capabilityList;

const debugInfo = {
  vao: canIUseVAO
};
gui.add(debugInfo, "vao").onChange(v => {
  if (v) {
    if (!canIUseVAO) {
      alert("您的浏览器不支持 VAO");
    } else {
      geometry.primitive.needRecreate = true;
      geometry.primitive.updateType = UpdateType.UPDATE_ALL;
      capability.set(GLCapabilityType.vertexArrayObject, true);
    }
  } else {
    geometry.primitive.needRecreate = true;
    geometry.primitive.updateType = UpdateType.UPDATE_ALL;
    capability.set(GLCapabilityType.vertexArrayObject, false);
  }
});
