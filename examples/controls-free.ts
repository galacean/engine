/**
 * @title Free Controls
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*kGvvTZNvUJEAAAAAAAAAAAAADiR2AQ/original
 */
/**
 * 本示例展示如何使用几何体渲染器功能、如何创建几何体资源对象、如何创建材质对象
 */
import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  MeshRenderer,
  MeshTopology,
  PrimitiveMesh,
  WebGLEngine,
} from "@galacean/engine";
import { FreeControl } from "@galacean/engine-toolkit-controls";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootNode = scene.createRootEntity("root");

  // 在场景中创建相机节点、配置位置和目标方向
  const cameraNode = rootNode.createChild("Camera");
  cameraNode.transform.setPosition(0, 0, 20);
  const camera = cameraNode.addComponent(Camera);
  const controler = cameraNode.addComponent(FreeControl);
  camera.farClipPlane = 2000;
  controler.movementSpeed = 100;
  controler.rotateSpeed = 1;

  const lightNode = rootNode.createChild("Light");
  lightNode.transform.setRotation(-45, 45, 0);
  lightNode.addComponent(DirectLight);

  const cuboid = PrimitiveMesh.createCuboid(engine, 50, 50, 50);
  const material = new BlinnPhongMaterial(engine);

  const groundGeometry = PrimitiveMesh.createPlane(
    engine,
    2000,
    2000,
    100,
    100
  );
  groundGeometry.subMesh.topology = MeshTopology.LineStrip;
  const groundMaterial = new BlinnPhongMaterial(engine);

  // create meshes in scene
  for (let i = 0; i < 100; i++) {
    let cube = rootNode.createChild("cube");
    cube.transform.setPosition(
      Math.random() * 2000 - 1000,
      Math.random() * 200,
      Math.random() * 2000 - 1000
    );
    const cubeRenderer = cube.addComponent(MeshRenderer);
    cubeRenderer.mesh = cuboid;
    cubeRenderer.setMaterial(material);
  }

  // Ground
  const ground = rootNode.createChild("ground");
  ground.transform.setPosition(0, -25, 0);
  const groundRender = ground.addComponent(MeshRenderer);
  groundRender.mesh = groundGeometry;
  groundRender.setMaterial(groundMaterial);

  // Run engine
  engine.run();
});
