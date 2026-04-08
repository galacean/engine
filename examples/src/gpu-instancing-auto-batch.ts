/**
 * @title GPU Instancing Auto Batch
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*jjZMTrp-vU8AAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit";
import {
  AmbientLight,
  AssetType,
  Camera,
  Color,
  DirectLight,
  GLTFResource,
  Logger,
  Vector3,
  WebGLEngine
} from "@galacean/engine";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then(async (engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("Root");

  // Camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 10, 80);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 300;
  cameraEntity.addComponent(OrbitControl);

  // Light
  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-45, -45, 0);
  lightEntity.addComponent(DirectLight).color = new Color(1, 1, 1, 1);

  // Load Duck model and ambient light
  const [glTF, ambientLight] = await Promise.all([
    engine.resourceManager.load<GLTFResource>({
      url: "https://gw.alipayobjects.com/os/bmw-prod/6cb8f543-285c-491a-8cfd-57a1160dc9ab.glb",
      type: AssetType.GLTF
    }),
    engine.resourceManager.load<AmbientLight>({
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*eRJ8QKzf5zAAAAAAgBAAAAgAekp5AQ/ambient.ambLight",
      type: AssetType.AmbientLight
    })
  ]);
  scene.ambientLight = ambientLight;

  // Clone 1000 ducks with random positions
  const count = 1000;
  const spread = 50;
  for (let i = 0; i < count; i++) {
    const duck = glTF.instantiateSceneRoot();
    duck.transform.setPosition(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread
    );
    duck.transform.setRotation(Math.random() * 360, Math.random() * 360, Math.random() * 360);
    rootEntity.addChild(duck);
  }

  engine.run();
});
