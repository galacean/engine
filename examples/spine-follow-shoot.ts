/**
 * @title Spine follow shoot
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*IALeTYOXMXwAAAAAAAAAAAAADiR2AQ/original
 */
import { Camera, Entity, Logger, Script, Vector3, WebGLEngine } from "@galacean/engine";
import { Bone, SpineAnimationRenderer } from "@galacean/engine-spine";

Logger.enable();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 100);
  camera.nearClipPlane = 0.001;
  camera.farClipPlane = 20000;

  engine.resourceManager
    .load({
      url: "https://mdn.alipayobjects.com/huamei_kz4wfo/uri/file/as/2/kz4wfo/4/mp/yKbdfgijyLGzQDyQ/spineboy/spineboy.json",
      type: "spine",
    })
    .then((spineResource: any) => {
      const spineEntity = new Entity(engine);
      spineEntity.transform.setPosition(0, -18, 0);
      const spine = spineEntity.addComponent(SpineAnimationRenderer);
      spine.resource = spineResource;
      spine.defaultState.scale = 0.05;
      rootEntity.addChild(spineEntity);
      const { state, skeleton } = spine;
      state.setAnimation(0, 'idle', true);
      state.setAnimation(1, 'aim', true);
      const shoot = () => {
        state.setAnimation(2, 'shoot', false);
      };
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
            const targetBone = skeleton.findBone('crosshair') as Bone;targetBone.y = worldPos.y + 380;
            targetBone.y = worldPos.y + 380;
            if (worldPos.x < 0) {
              skeleton.scaleX = -0.05;
              targetBone.x = -worldPos.x;
            } else {
              skeleton.scaleX = 0.05;
              targetBone.x = worldPos.x;
            }
          }
          if (inputManager.isPointerDown()) {
            shoot();
          }
        }
      });
    });

  engine.run();
});


