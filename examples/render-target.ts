/**
 * @title Render Target
 * @category Camera
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*VLd3QYdpb1MAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Animator,
  AssetType,
  BackgroundMode,
  Camera,
  Entity,
  GLTFResource,
  Layer,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  RenderTarget,
  Script,
  SkyBoxMaterial,
  Texture2D,
  TextureCube,
  UnlitMaterial,
  WebGLEngine,
} from "@galacean/engine";

// Create scene

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 10);
  const control = cameraEntity.addComponent(OrbitControl);
  control.minDistance = 3;

  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);

  // Create planes to mock mirror
  const planeEntity = rootEntity.createChild("mirror");
  const planeRenderer = planeEntity.addComponent(MeshRenderer);
  const mesh = PrimitiveMesh.createPlane(engine, 2, 2);
  const material = new UnlitMaterial(engine);

  planeEntity.transform.setRotation(90, 0, 0);
  material.renderFace = RenderFace.Double;
  planeRenderer.mesh = mesh;
  planeRenderer.setMaterial(material);
  for (let i = 0; i < 8; i++) {
    const clone = planeEntity.clone();
    planeEntity.parent.addChild(clone);

    clone.layer = Layer.Layer1;
    clone.transform.setPosition((i - 4) * 2, 0, i % 2 ? -5 : -8);
  }
  planeEntity.isActive = false;

  // Create sky
  const background = scene.background;
  const sky = background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  background.mode = BackgroundMode.Sky;
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  // Add script to switch `camera.renderTarget`
  class switchRTScript extends Script {
    renderColorTexture = new Texture2D(engine, 1024, 1024);
    renderTarget = new RenderTarget(
      engine,
      1024,
      1024,
      this.renderColorTexture
    );

    constructor(entity: Entity) {
      super(entity);
      material.baseTexture = this.renderColorTexture;
    }

    onBeginRender(camera: Camera) {
      camera.renderTarget = this.renderTarget;
      camera.cullingMask = Layer.Layer0;
      camera.render();
      camera.renderTarget = null;
      camera.cullingMask = Layer.Everything;
    }
  }

  cameraEntity.addComponent(switchRTScript);

  engine.resourceManager
    .load<TextureCube>({
      urls: [
        "https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*Gi7CTZqKuacAAAAAAAAAAABkARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*iRRMQIExwKMAAAAAAAAAAABkARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*ZIcPQZo20sAAAAAAAAAAAABkARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*SPYuTbHT-KgAAAAAAAAAAABkARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*mGUERbY77roAAAAAAAAAAABkARQnAQ",
        "https://gw.alipayobjects.com/mdn/rms_475770/afts/img/A*ilkPS7A1_JsAAAAAAAAAAABkARQnAQ",
      ],
      type: AssetType.TextureCube,
    })
    .then((cubeMap) => {
      // Load glTF
      engine.resourceManager
        .load<GLTFResource>(
          "https://gw.alipayobjects.com/os/bmw-prod/8cc524dd-2481-438d-8374-3c933adea3b6.gltf"
        )
        .then((gltf) => {
          const { animations, defaultSceneRoot } = gltf;

          rootEntity.addChild(defaultSceneRoot);
          const animator = defaultSceneRoot.getComponent(Animator);
          animator.play(animations[0].name);
        });

      scene.ambientLight.specularTexture = cubeMap;
      skyMaterial.texture = cubeMap;
      engine.run();
    });
});
