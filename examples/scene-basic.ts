/**
 * @title Scene Basic
 * @category Basic
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*qnCQRJ_-fwQAAAAAAAAAAAAADiR2AQ/original
 */
// Import Modules
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

// Init Engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  // Adapter to screen
  engine.canvas.resizeByClientSize();

  // Get root entity of current scene
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  // Init Camera
  let cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.position = new Vector3(0, 5, 10);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(Camera);
  scene.background.solidColor.set(1, 1, 1, 1);

  // Create a entity to add light component
  let lightEntity = rootEntity.createChild("light");

  // Create light component
  let directLight = lightEntity.addComponent(DirectLight);
  directLight.color = new Color(1.0, 1.0, 1.0);
  directLight.intensity = 0.5;

  // Control light direction by entity's transform
  lightEntity.transform.rotation = new Vector3(45, 45, 45);

  // Create Cube
  let cubeEntity = rootEntity.createChild("cube");
  let cube = cubeEntity.addComponent(MeshRenderer);
  cube.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
  cube.setMaterial(new BlinnPhongMaterial(engine));

  // Run Engine
  engine.run();
});
