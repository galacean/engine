/**
 * @title Renderer Cull
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*6LDmR5sbLu4AAAAAAAAAAAAADiR2AQ/original
 */
import * as dat from "dat.gui";
import {
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  MeshRenderer,
  PrimitiveMesh,
  Script,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { FreeControl } from "@galacean/engine-toolkit-controls";
const gui = new dat.GUI();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  //-- create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.position = new Vector3(0, 0, 50);
  cameraEntity.addComponent(Camera);
  const control = cameraEntity.addComponent(FreeControl);
  control.movementSpeed = 50;

  engine.run();

  // create two renderer
  const cube = rootEntity.createChild("cube1");
  const cube2 = rootEntity.createChild("cube2");
  cube.transform.position = new Vector3(-10, 0, 0);
  cube2.transform.position = new Vector3(10, 0, 0);

  const lightNode = rootEntity.createChild("Light");
  lightNode.transform.setRotation(-45, 0, 0);
  lightNode.addComponent(DirectLight);

  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(1, 0, 0, 1);
  const material2 = new BlinnPhongMaterial(engine);
  material2.baseColor = new Color(0, 0, 1, 1);
  const geometry = PrimitiveMesh.createCuboid(engine, 5, 5, 5);
  const sphereGeometry = PrimitiveMesh.createSphere(engine, 5);

  const cubeRenderer = cube.addComponent(MeshRenderer);
  const cubeRenderer2 = cube2.addComponent(MeshRenderer);

  cubeRenderer.mesh = geometry;
  cubeRenderer.setMaterial(material);

  cubeRenderer2.mesh = sphereGeometry;
  cubeRenderer2.setMaterial(material2);

  // rotate
  class RotationScript extends Script {
    onUpdate() {
      this.entity.transform.rotate(1, 1, 1);
    }
  }
  cube.addComponent(RotationScript);
  cube2.addComponent(RotationScript);

  // observe renderer-cull
  const state = {
    cube1: "正常渲染",
    cube2: "正常渲染",
  };

  class ObserverScript extends Script {
    onUpdate() {
      state.cube1 = cubeRenderer.isCulled ? "视锥体裁剪" : "正常渲染";
      state.cube2 = cubeRenderer2.isCulled ? "视锥体裁剪" : "正常渲染";
    }
  }

  rootEntity.addComponent(ObserverScript);

  const folder = gui.addFolder("移动视角，观察视锥体裁剪情况");
  folder.add(state, "cube1").name("红色立方体").listen();
  folder.add(state, "cube2").name("蓝色球体").listen();
  folder.open();
});
