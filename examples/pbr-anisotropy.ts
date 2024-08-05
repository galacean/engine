/**
 * @title PBR Anisotropy
 * @category Material
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*AGD9SLdc8JIAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AmbientLight,
  Animator,
  AssetType,
  Camera,
  DirectLight,
  GLTFResource,
  PBRMaterial,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";

const gui = new dat.GUI();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0.35, 0.5);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(OrbitControl);

  const lightEntity = rootEntity.createChild("light");
  const light = lightEntity.addComponent(DirectLight);
  lightEntity.transform.setRotation(-50, 180, 0);
  light.color.set(0.1, 0, 0, 1);

  Promise.all([
    engine.resourceManager.load<AmbientLight>({
      type: AssetType.Env,
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*4zvFQaMWvOsAAAAAAAAAAAAADkp5AQ/ambient.bin"
    }),
    engine.resourceManager.load<Texture2D>({
      type: AssetType.Texture2D,
      url: "https://mdn.alipayobjects.com/huamei_dmxymu/afts/img/A*ZDwpRbRVDVwAAAAAAAAAAAAADuuHAQ/original"
    }),
    engine.resourceManager.load<GLTFResource>({
      type: AssetType.GLTF,
      url: "https://mdn.alipayobjects.com/oasis_be/afts/file/A*Quc2T4zf_5YAAAAAAAAAAAAADkp5AQ/anisotropic_record_test.glb"
    })
  ]).then(([ambientLight, texture, glTF]) => {
    ambientLight.specularIntensity = 3;
    ambientLight.diffuseIntensity = 3;
    scene.ambientLight = ambientLight;

    const { defaultSceneRoot, materials, animations } = glTF;
    rootEntity.addChild(defaultSceneRoot);
    const material = materials![0] as PBRMaterial;
    const animator = defaultSceneRoot.getComponent(Animator)!;
    const debugInfo = {
      rotate: true,
      texture: true
    };

    animator.play(animations![0].name);
    animator.speed = 0.2;
    material.anisotropy = 1;
    material.anisotropyRotation = 45; // [1,1]
    material.anisotropyTexture = texture;

    gui.add(material, "anisotropy", -1, 1, 0.01);
    gui.add(material, "anisotropyRotation", -180, 180, 0.01);

    gui.add(debugInfo, "rotate").onChange((v) => {
      animator.speed = v ? 1 : 0;
    });

    gui.add(debugInfo, "texture").onChange((v) => {
      if (v) {
        material.anisotropyTexture = texture;
      } else {
        material.anisotropyTexture = null;
      }
    });

    engine.run();
  });
});
