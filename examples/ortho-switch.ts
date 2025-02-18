/**
 * @title Orthographic Camera
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*WK0RSLboFQgAAAAAAAAAAAAADiR2AQ/original
 */
import { GUI } from "dat.gui";
import {
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  MeshRenderer,
  PrimitiveMesh,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // init camera
  const cameraEntity = rootEntity.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.nearClipPlane = 0.1;
  cameraEntity.transform.setPosition(10, 2, 10);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(OrbitControl);

  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-30, 0, 0);
  lightEntity.addComponent(DirectLight);

  // init cube
  createCube(0, 0, 0);
  createCube(6.5, 0, 6.5);
  createCube(-6.5, 0, -6.5);
  addGUI();

  engine.run();

  function createCube(x: number, y: number, z: number) {
    const cubeEntity = rootEntity.createChild("cube");
    const renderer = cubeEntity.addComponent(MeshRenderer);
    const material = new BlinnPhongMaterial(engine);
    cubeEntity.transform.setPosition(x, y, z);
    material.baseColor = new Color(1, 0.25, 0.25, 1);
    renderer.setMaterial(material);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  }

  function addGUI() {
    const gui = new GUI();
    const cameraFolder = gui.addFolder("camera orthogonal switch");
    cameraFolder.open();
    camera.isOrthographic = true;
    cameraFolder.add(camera, "isOrthographic");
  }
});
