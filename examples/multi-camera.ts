/**
 * @title Multi Camera
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*_vyfS5xqVe4AAAAAAAAAAAAADiR2AQ/original
 */

import { SpineAnimationRenderer } from "@galacean/engine-spine";
import {
  AssetType,
  BackgroundMode,
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  Entity,
  Layer,
  MeshRenderer,
  PrimitiveMesh,
  Script,
  SkyBoxMaterial,
  TextureCube,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

/**
 * Script for rotate.
 */
class RotateScript extends Script {
  /**
   * @override
   * The main loop, called frame by frame.
   * @param deltaTime - The deltaTime when the script update.
   */
  onUpdate(deltaTime: number): void {
    this.entity.transform.rotate(0.0, 0.6, 0);
  }
}

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const { background } = scene;
  const rootEntity = scene.createRootEntity();

  // init full screen camera
  const cameraEntity = rootEntity.createChild("fullscreen-camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.cullingMask = Layer.Layer0;
  cameraEntity.transform.setPosition(10, 10, 10);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(OrbitControl);

  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setRotation(-30, 0, 0);
  lightEntity.addComponent(DirectLight);

  // init cube
  const cubeEntity = rootEntity.createChild("cube");
  cubeEntity.transform.setPosition(-3, 0, 3);
  const renderer = cubeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(1, 0.25, 0.25, 1);
  renderer.setMaterial(material);
  cubeEntity.addComponent(RotateScript);

  //----------------------------------------------------------------------------------------------------------------------
  // init window camera
  const windowEntity = scene.createRootEntity();
  windowEntity.layer = Layer.Layer1;
  const windowCameraEntity = windowEntity.createChild("window-camera");
  const windowCamera = windowCameraEntity.addComponent(Camera);
  windowCamera.cullingMask = Layer.Layer1;
  windowCamera.viewport.set(0.5, 0.2, 0.3, 0.6);
  windowCamera.farClipPlane = 200;
  windowCameraEntity.transform.setPosition(0, 3, 20);

  engine.run();

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_kz4wfo/uri/file/as/2/kz4wfo/4/mp/qGISZ7QTJFkEL0Qx/spineboy/spineboy.json",
      type: "spine"
    })
    .then((spineResource: any) => {
      const spineEntity = new Entity(engine);
      spineEntity.layer = Layer.Layer1;
      spineEntity.transform.setPosition(0, -3, 0);
      const spine = spineEntity.addComponent(SpineAnimationRenderer);
      spine.resource = spineResource;
      spine.defaultState.scale = 0.01;
      windowEntity.addChild(spineEntity);
      const { state } = spine;
      state.data.defaultMix = 0.3;
      state.data.setMix("death", "portal", 0);
      state.setAnimation(0, "walk", true, 1);
    });

  engine.resourceManager
    .load<TextureCube>({
      urls: [
        "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*5w6_Rr6ML6IAAAAAAAAAAAAAARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*TiT2TbN5cG4AAAAAAAAAAAAAARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*8GF6Q4LZefUAAAAAAAAAAAAAARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*D5pdRqUHC3IAAAAAAAAAAAAAARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*_FooTIp6pNIAAAAAAAAAAAAAARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*CYGZR7ogZfoAAAAAAAAAAAAAARQnAQ"
      ],
      type: AssetType.TextureCube
    })
    .then((cubeMap1) => {
      // Add skybox background
      background.mode = BackgroundMode.Sky;
      const skyMaterial = (background.sky.material = new SkyBoxMaterial(engine));
      skyMaterial.texture = cubeMap1;
      background.sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
    });
});
