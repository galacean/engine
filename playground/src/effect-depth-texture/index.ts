import { Engine } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { SphereGeometry } from "@alipay/o3-geometry-shape";
import { ADirectLight } from "@alipay/o3-lighting";
import { BlinnPhongMaterial } from "@alipay/o3-mobile-material";
import { addDepthTexturePass } from "@alipay/o3-post-processing";
import { vec3 } from "@alipay/o3-math";
import { AOrbitControls } from "@alipay/o3-orbit-controls";
import "@alipay/o3-shadow";
import { ResourceLoader, Resource } from "@alipay/o3-loader";
import { WaterMaterial } from "./WaterMaterial";
import { PlaneGeometry } from "../common/PlaneGeometry";
import { ASpriteRenderer } from "@alipay/o3-2d";
import "@alipay/o3-loader-gltf";

function createSphereGeometry(name, position, r, h, v, as?, ae?, ts?, te?) {
  let node = rootNode.createChild(name);
  node.position = position;
  let renderer = node.createAbility(AGeometryRenderer);
  renderer.geometry = new SphereGeometry(r, h, v, as, ae, ts, te);
  renderer.setMaterial(sphMtl);

  return node;
}

function createPlaneGeometry(name, position, w) {
  let node = rootNode.createChild(name);
  node.position = position;
  let renderer = node.createAbility(AGeometryRenderer);
  renderer.renderPassFlag = 0x01;
  renderer.geometry = new PlaneGeometry(w, w);
  renderer.setMaterial(waterMtl);

  node.rotateByAngles(270, 0, 0);

  return node;
}

function showRenderTexture(renderTarget, directLight, rootNode) {
  let textures = [renderTarget.texture, directLight.shadow.map];
  let positions = [
    [-1.8, 2.3, 0],
    [-1.8, 1.0, 0]
  ];
  for (let i = 0; i < textures.length; i++) {
    const texNode = rootNode.createChild("depthTextureNode");
    texNode.position = positions[i];
    texNode.scale = [0.1, 0.1, 1];
    const spriteRenderer = texNode.createAbility(ASpriteRenderer, {
      texture: textures[i],
      rect: { x: 0, y: 0, width: 512, height: 512 }
    });
  }
}

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const canvas = document.getElementById("o3-demo");
const cameraNode = rootNode.createChild("camera_node");
const camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: canvas,
  position: [0, 5, 8],
  target: [0, 0, 0],
  near: 0.1,
  far: 30
});
let controler = cameraNode.createAbility(AOrbitControls, { mainElement: document.getElementById("o3-demo") });
controler.minDistance = 4;
controler.maxDistance = 50;

// 添加一个方向光
let light = rootNode.createChild("light");
light.position = [-3, 5, 0];
light.lookAt([0, 0, 0], [0, 1, 0]);
let directLight = light.createAbility(ADirectLight, {
  color: vec3.fromValues(0.4, 0.6, 0.75),
  intensity: 0.8
});
directLight["enableShadow"] = true;

// 创建材质（可以水材质 和 BlinnPhong 材质）
const waterMtl = new WaterMaterial("water_mtl"); //
const sphMtl = new BlinnPhongMaterial("sphere_mtl"); //

// 添加渲染深度的 RenderPass
let renderTarget = addDepthTexturePass(camera, 0x01);
waterMtl.setValue("u_depthTexture", renderTarget.depthTexture);

// 创建球体, 控制球体上下运动
let sphere = createSphereGeometry("sphere3", [0, 0, 0], 1, 20, 20);
sphere.castShadow = true;
sphere.onUpdate = () => {
  let p = sphere.position;
  let t = engine.time.timeSinceStartup * 0.001;
  sphere.position = vec3.fromValues(p[0], Math.sin(t) * 2 - 1, p[2]);
};

// 创建平面形的水面
let plane = createPlaneGeometry("plane", [0, -2, 0], 6);
plane.recieveShadow = true;

//-- 显示深度纹理、 shadow map
showRenderTexture(renderTarget, directLight, rootNode);

// 启动引擎
engine.run();

const techRes = new Resource("image", { type: "texture", url: "/static/texture/effect-sea/00.jpg" });
const resourceLoader = new ResourceLoader(engine);
resourceLoader.batchLoad([techRes], (err, res) => {
  waterMtl.setValue("u_texture", res[0].asset);
});
