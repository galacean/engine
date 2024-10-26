/**
 * @title Spine Physics
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IALeTYOXMXwAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Entity, Logger, Script, Vector3, WebGLEngine } from "@galacean/engine";
import { SpineAnimationRenderer } from "@galacean/engine-spine";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 2000);
  camera.nearClipPlane = 0.001;
  camera.farClipPlane = 20000;

  engine.resourceManager
    .load({
      urls: [
        "https://mdn.alipayobjects.com/portal_h1wdez/afts/file/A*Po6oQJyLdb0AAAAAAAAAAAAAAQAAAQ?a=.json",
        "https://mdn.alipayobjects.com/portal_h1wdez/afts/file/A*CnqHS5nRzTIAAAAAAAAAAAAAAQAAAQ?b=.atlas",
        "https://mdn.alipayobjects.com/portal_h1wdez/afts/img/A*WDXeRIpd-lAAAAAAAAAAAAAAAQAAAQ/original?c=.png"
      ],
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = new Entity(engine);
      spineEntity.transform.setPosition(0, -250, 0);
      const spine = spineEntity.addComponent(SpineAnimationRenderer);
      spine.resource = spineResource;
      spine.defaultState.animationName = 'wind-idle';
      spine.defaultState.scale = 0.5;
      rootEntity.addChild(spineEntity);
      const { skeleton } = spine;
      spineEntity.addComponent(class extends Script {
        private _vec3 = new Vector3();
        onUpdate(): void {
          const { inputManager } = engine;
          const pointers = inputManager.pointers;
          if (pointers.length > 0) {
            const { position } = pointers[0];
            const worldPos = this._vec3;
            camera.screenToWorldPoint(
              new Vector3(position.x, position.y, 2000),
              worldPos,
            );
            skeleton.y = worldPos.y - 480;
            skeleton.x = worldPos.x;
          }
        }
      });
    });

  engine.run();
});
