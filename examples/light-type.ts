/**
 * @title Light Type
 * @category Light
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*z9MpQagp8WEAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  MeshRenderer,
  PointLight,
  PrimitiveMesh,
  RenderFace,
  SpotLight,
  UnlitMaterial,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
const gui = new dat.GUI();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create Ground
  const groundEntity = rootEntity.createChild("ground");
  const groundRenderer = groundEntity.addComponent(MeshRenderer);
  const mesh = PrimitiveMesh.createPlane(engine, 100, 100);
  const material = new BlinnPhongMaterial(engine);

  material.renderFace = RenderFace.Double;
  groundRenderer.mesh = mesh;
  groundRenderer.setMaterial(material);

  // Create camera
  const cameraNode = rootEntity.createChild("camera_node");
  cameraNode.transform.setPosition(0, 30, 50);
  const camera = cameraNode.addComponent(Camera);
  camera.farClipPlane = 200;

  const control = cameraNode.addComponent(OrbitControl);
  control.maxDistance = 100;

  // Create spot light
  const lightEntity = rootEntity.createChild("light");
  const spotLight = lightEntity.addComponent(SpotLight);
  const pointLight = lightEntity.addComponent(PointLight);
  const directionalLight = lightEntity.addComponent(DirectLight);
  const target = new Vector3(0, 0, 0);
  const up = new Vector3(0, 1, 0);

  let light: any = spotLight;
  pointLight.enabled = false;
  directionalLight.enabled = false;

  lightEntity.transform.setPosition(20, 20, 0);
  lightEntity.transform.lookAt(target, up);

  const lightRenderer = lightEntity.addComponent(MeshRenderer);
  lightRenderer.mesh = PrimitiveMesh.createSphere(engine, 1);
  lightRenderer.setMaterial(new UnlitMaterial(engine));

  // Debug
  const debugInfo = {
    type: "SpotLight",
    angle: 30,
    penumbra: 15,
    x: 20,
    y: 20,
    z: 0,
  };

  gui
    .add(debugInfo, "type", ["DirectionalLight", "PointLight", "SpotLight"])
    .onChange((v) => {
      light.enabled = false;
      spotFolder.closed = true;
      switch (v) {
        case "SpotLight":
          light = spotLight;
          light.enabled = true;
          spotFolder.closed = false;
          break;
        case "DirectionalLight":
          light = directionalLight;
          light.enabled = true;
          break;
        case "PointLight":
          light = pointLight;
          light.enabled = true;
          break;
      }
    });
  gui.add(light, "distance", 0, 100, 1);

  const folder = gui.addFolder("位置");
  folder.open();
  folder.add(debugInfo, "x", -100, 100).onChange((v) => {
    const last = lightEntity.transform.position;
    lightEntity.transform.setPosition(v, last.y, last.z);
    lightEntity.transform.lookAt(target, up);
  });
  folder.add(debugInfo, "y", 0, 100).onChange((v) => {
    const last = lightEntity.transform.position;
    lightEntity.transform.setPosition(last.x, v, last.z);
    lightEntity.transform.lookAt(target, up);
  });
  folder.add(debugInfo, "z", -100, 100).onChange((v) => {
    const last = lightEntity.transform.position;
    lightEntity.transform.setPosition(last.x, last.y, v);
    lightEntity.transform.lookAt(target, up);
  });

  const spotFolder = gui.addFolder("SpotLight");
  spotFolder.open();

  spotFolder.add(debugInfo, "angle", 1, 90, 1).onChange((v) => {
    light.angle = (v * Math.PI) / 180;
  });
  spotFolder.add(debugInfo, "penumbra", 1, 90, 1).onChange((v) => {
    light.penumbra = (v * Math.PI) / 180;
  });

  // Run
  engine.run();
});
