/**
 * @title Spine Animation
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IALeTYOXMXwAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Logger, Vector3, WebGLEngine, Entity } from "@galacean/engine";
import { SpineRenderer } from "@galacean/engine-spine";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 60);

  engine.resourceManager
    .load({
      url: "https://mmtcdp.stable.alipay.net/oasis_be/afts/file/A*jceoSrUXbUYAAAAAAAAAAAAADnN-AQ/spineboy.json",
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = rootEntity.createChild("spine");
      spineEntity.transform.setPosition(0, -18, 0);
      const spineRenderer = spineEntity.addComponent(SpineRenderer);
      spineRenderer.scale = 0.05;
      spineRenderer.animationName = "walk";
      spineRenderer.resource = spineResource;
    });

  engine.run();
});
