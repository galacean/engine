/**
 * @title Planar Shadow
 * @category Toolkit
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*F7EqQpFQuzAAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Animator,
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  GLTFResource,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

import { Color } from "@galacean/engine";
import { PlanarShadowShaderFactory } from "@galacean/engine-toolkit";

/**
 * Planar Shadow
 */

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.setPosition(0, 1, 5);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);

  const lightEntity = rootEntity.createChild("light_node");
  lightEntity.addComponent(DirectLight);
  lightEntity.transform.setPosition(-10, 10, 10);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  const planeEntity = rootEntity.createChild("plane_node");
  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
  const planeMaterial = new BlinnPhongMaterial(engine);
  planeMaterial.baseColor.set(1, 1.0, 0, 1.0);
  renderer.setMaterial(planeMaterial);

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb"
    )
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      rootEntity.addChild(defaultSceneRoot);

      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play(asset.animations[0].name);

      const lightDirection = lightEntity.transform.worldForward;

      const renderers = new Array<MeshRenderer>();
      defaultSceneRoot.getComponentsIncludeChildren(MeshRenderer, renderers);

      for (let i = 0, n = renderers.length; i < n; i++) {
        const material = renderers[i].getMaterial();
        PlanarShadowShaderFactory.replaceShader(material);
        PlanarShadowShaderFactory.setShadowFalloff(material, 0.2);
        PlanarShadowShaderFactory.setPlanarHeight(material, 0.01);
        PlanarShadowShaderFactory.setLightDirection(material, lightDirection);
        PlanarShadowShaderFactory.setShadowColor(
          material,
          new Color(0, 0, 0, 1.0)
        );
      }
    });

  engine.run();
});
